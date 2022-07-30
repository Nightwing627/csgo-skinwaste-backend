import moment from 'moment'
import BadWords from 'bad-words'
import BaseService from './BaseService'
import { ERROR as Error } from '../constants/Errors'
import User, { EBanLevel } from '../models/User'
import ChatMessage from '../models/ChatMessage'
import Util from '../utils'
import Config from '../models/Config'

export default class Chat extends BaseService {
  io: any
  chat: any
  enabled: boolean
  chatTimeout: any
  chatTimeoutUser: any
  Settings: any
  subscriber: any
  filter: BadWords
  mode: any
  minDepo: any

  constructor(io, { Settings }) {
    super({ location: 'service/Chat' })

    this.io = io
    this.Settings = Settings

    this.chat = {
      en: [],
      de: [],
      tr: [],
      ru: [],
      fr: [],
    }

    this.enabled = false
    this.mode = 'mod'
    this.minDepo = 500
    this.chatTimeout = null
    this.chatTimeoutUser = {}

    this.Settings.on('site', ({ chat, enabled }) => {
      this.enabled = enabled.chat
      this.chatTimeout = chat.timeout.enabled ? chat.timeout.timeout_per_message : null
      this.mode = chat.mode.current
      this.minDepo = chat.mode.minDepo
    })

    this._initializeChat()
  }

  private sleep(ms) {
    return new Promise(resolve => {
      setTimeout(resolve, ms)
    })
  }

  private async _updateSettings() {
    const { chat, enabled } = await this.Settings.getSiteSettings()
    this.enabled = enabled.chat
    this.chatTimeout = chat.timeout.enabled ? chat.timeout.timeout_per_message : null
    this.mode = chat.mode.current
    this.minDepo = chat.mode.minDepo

    this.Logger.info(this.chatTimeout)
  }

  private async _initializeChat() {
    try {
      await this._updateSettings()

      await Promise.all(
        Object.keys(this.chat).map(key =>
          ChatMessage.find({ $or: [{ room: key }, { room: 'all' }], deleted: { $exists: false } })
            .sort({ createdAt: -1 })
            .limit(25)
            .then(messages => (this.chat[key] = messages.reverse()))
        )
      )
    } catch (e) {
      this.Logger.error(e)
      process.exit(0)
    }
  }

  get() {
    return this.chat
  }

  public async botSendMessage(msg, room, userID = null) {
    const message = {
      message: msg,
      announcement: false,
      date: new Date(),
      room,
      user: {
        user_id: 'BOT',
        username: 'SkinWaste Bot',
        avatar: 'https://imgur.com/a/9EoQ9v8',
        rank: 4,
      },
    }

    const storedMessage = await new ChatMessage(message).save()

    if (userID) {
      this.io.to(userID).emit('chat.message', { message: storedMessage })
    } else {
      if (this.chat.en.length === 25) {
        this.chat[room].shift()
        this.chat[room].push(storedMessage)
      } else {
        this.chat[room].push(storedMessage)
      }

      this.io.emit('chat.message', { message: storedMessage, room })
    }
  }

  sendMessage(user, msg, room) {
    return new Promise<void>(async (resolve, reject) => {
      if (!this.chat[room]) return reject({ code: Error.InvalidRoom, message: 'INVALID_ROOM' })
      // if (!user.agreeChatRules) return reject({ code: Error.MustAgreeChatRules, message: 'MUST_AGREE_CHAT_RULES' });
      if (user.rank < 2) {
        if (!this.enabled) return reject({ code: Error.AdminLock, message: 'ADMIN_LOCKED' })
        if (EBanLevel.Chat === user.banLevel && user.banExp > new Date()) {
          return reject({
            code: Error.UserMuted,
            message: 'USER_MUTED',
            errors: { timeLeft: new Date(user.banExp).getTime() - Date.now() },
          })
        }
        if (EBanLevel.Chat === user.banLevel && user.banExp < new Date()) {
          await User.findByIdAndUpdate(user._id, { banLevel: EBanLevel.None })
        }

        if (EBanLevel.Site === user.banLevel) return reject({ code: Error.Banned, message: 'USER_BANNED' })
      }
      if (typeof msg !== 'string' || msg.length > 255 || !msg.replace(/\s/g, '').length)
        return reject({ code: Error.InvalidParams, message: 'INVALID_PARAMS' })

      if (this.mode === 'deposit' && user.deposited < this.minDepo && user.rank <= 1)
        return reject({
          code: Error.DepositMode,
          message: 'NEED_TO_DEPOSIT',
          errors: { toDeposit: this.minDepo - user.deposited },
        })

      if (this.mode === 'mod' && user.rank <= 1) return reject({ code: Error.ModMode, message: 'MOD_MODE' })

      if (this.chatTimeout && user.rank <= 1) {
        const now = Date.now() + this.chatTimeout
        if (this.chatTimeoutUser[user._id] && this.chatTimeoutUser[user._id] >= Date.now()) {
          return reject({
            code: Error.ChatTimeout,
            message: 'CHAT_TIMEOUT',
            errors: { timeLeft: this.chatTimeoutUser[user._id] - Date.now() },
          })
        }

        this.chatTimeoutUser[user._id] = now
      }

      let isAnnouncement = false
      let allRooms = false

      if (msg[0] === '/') {
        if (user.rank < 2) return reject({ code: Error.InsufficientPrivilege, message: 'INSUFFICIENT_PRIVS' })

        if (msg.startsWith('/announce ')) {
          msg = msg.replace('/announce ', '')
          isAnnouncement = true
        } else if (msg.startsWith('/announceall ')) {
          msg = msg.replace('/announceall ', '')
          isAnnouncement = true
          allRooms = true
        } else if (msg.startsWith('/slowmode')) {
          try {
            msg = msg.replace('/slowmode ', '').split(' ')
            if (msg[0] < 0)
              return reject({
                code: Error.InvalidParams,
                message: 'INVALID_PARAMS',
              })

            await this.slowMode(parseInt(msg[0], 10) * 1e3)
            this.io.to(user._id).emit('chat.commandComplete', null)
            return resolve()
          } catch (e) {
            return reject(e)
          }
        } else if (msg.startsWith('/mode')) {
          try {
            const modes = ['open', 'deposit', 'mod']
            msg = msg.replace('/mode ', '').split(' ')
            if (modes.indexOf(msg[0]) === -1)
              return reject({
                code: Error.InvalidParams,
                message: 'INVALID_PARAMS',
              })

            await this.changeMode(msg[0])
            this.io.to(user._id).emit('chat.commandComplete', null)
            return resolve()
          } catch (e) {
            return reject(e)
          }
        } else if (msg.startsWith('/mute')) {
          /**
           * /mute userID type(min,hour,day) amount
           */
          try {
            const type = ['min', 'hour', 'day']
            msg = msg.replace('/mute ', '').split(' ')
            if (type.indexOf(msg[1]) === -1)
              return reject({
                code: Error.InvalidParams,
                message: 'INVALID_PARAMS',
              })
            await this.mute(msg)
            this.io.to(user._id).emit('chat.commandComplete', null)
            return resolve()
          } catch (e) {
            return reject(e)
          }
        } else if (msg.startsWith('/unmute')) {
          /**
           * /unmute userID
           */
          try {
            msg = msg.replace('/unmute ', '').split(' ')
            await this.unmute(msg[0])
            this.io.to(user._id).emit('chat.commandComplete', null)
            return resolve()
          } catch (e) {
            reject(e)
          }
        } else if (msg.startsWith('/clear')) {
          /**
           * /clear room(en,fr,ru)
           */
          msg = msg.replace('/clear ', '').split(' ')
          if (!this.chat[msg[0]]) return reject({ code: Error.InvalidRoom, message: 'INVALID_ROOM' })
          this.clearRoom(msg[0])
          this.io.to(user._id).emit('chat.commandComplete', null)
          return resolve()
        } else if (msg.startsWith('/purge')) {
          /**
           * /purge userID
           */

          msg = msg.replace('/purge ', '').split(' ')
          this.purge(msg[0])
          this.io.to(user._id).emit('chat.commandComplete', null)
          return resolve()
        } else if (msg.startsWith('/verify')) {
          /**
           * /verify userID
           */
          try {
            msg = msg.replace('/verify ', '').split(' ')
            await this.verifyUser(msg[0])
            this.io.to(user._id).emit('chat.commandComplete', null)
            return resolve()
          } catch (e) {
            return reject(e)
          }
        } else if (msg.startsWith('/unverify')) {
          /**
           * /verify userID
           */
          try {
            msg = msg.replace('/unverify ', '').split(' ')
            await this.unverifyUser(msg[0])
            this.io.to(user._id).emit('chat.commandComplete', null)
            return resolve()
          } catch (e) {
            return reject(e)
          }
        } else if (msg.startsWith('/resetRooms')) {
          await this.resetAllRooms()
          return resolve()
        } else if (msg.startsWith('/maintenance')) {
          if (user.rank < 3) return reject({ code: Error.InsufficientPrivilege, message: 'INSUFFICIENT_PRIVS' })
          await this.toggleMaintenance()
          this.io.to(user._id).emit('chat.commandComplete', null)
          return resolve()
        } else if (msg.startsWith('/countdown')) {
          if (user.rank < 3) return reject({ code: Error.InsufficientPrivilege, message: 'INSUFFICIENT_PRIVS' })
          await this.toggleCountdown()
          this.io.to(user._id).emit('chat.commandComplete', null)
          return resolve()
        } else {
          return reject({ code: Error.InvalidCommand, message: 'INVALID_COMMAND' })
        }
      }

      if (!isAnnouncement && this.mode === 'mod' && user.rank === 3) return resolve()

      msg = msg
        .toString()
        .replace(/(<script(\s|\S)*?<\/script>)|(<style(\s|\S)*?<\/style>)|(<!--(\s|\S)*?-->)|(<\/?(\s|\S)*?>)/g, '')
      msg = msg.toString().replace(/(nigg(a|er|e))|(fagget)|(fag)/gi, '!@$%*')

      const message = {
        message: msg,
        announcement: isAnnouncement,
        date: new Date(),
        room: allRooms ? 'all' : room,
        user: {
          user_id: isAnnouncement ? 'ADMIN' : user._id,
          username: isAnnouncement ? 'System' : user.username,
          steamid: isAnnouncement ? 'ADMIN' : user.steamID,
          avatar: isAnnouncement ? '' : user.avatar,
          rank: isAnnouncement ? 0 : user.rank,
          level: isAnnouncement ? 0 : Util.getLevel(user.wagered ? user.wagered : 0),
        },
      }

      const storedMessage = await new ChatMessage(message).save()

      if (allRooms) {
        for (const roomX of Object.keys(this.chat)) {
          if (this.chat[roomX].length === 25) {
            this.chat[roomX].shift()
            this.chat[roomX].push(storedMessage)
          } else {
            this.chat[roomX].push(storedMessage)
          }

          this.io.emit('chat.message', { message: storedMessage, room: roomX })
        }

        return resolve()
      }

      if (this.chat[room].length === 25) {
        this.chat[room].shift()
        this.chat[room].push(storedMessage)
      } else {
        this.chat[room].push(storedMessage)
      }

      this.io.emit('chat.message', { message: storedMessage, room })
      resolve()
    })
  }

  public async acceptChatRules(userId) {
    try {
      const user = await User.findByIdAndUpdate(userId, { agreeChatRules: true })
      if (!user) return Promise.reject({ code: Error.UserNotFound, message: 'USER_NOT_FOUND' })
    } catch (e) {
      return Promise.reject({ code: Error.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async changeMode(mode) {
    try {
      const configData = await Config.findOne({ feature: 'site' }).lean()
      configData.settings.chat.mode.current = mode
      await Config.replaceOne({ feature: 'site' }, configData)
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: Error.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async slowMode(timeout = 0) {
    try {
      const configData = await Config.findOne({ feature: 'site' }).lean()
      configData.settings.chat.timeout = {
        enabled: timeout !== 0,
        timeout_per_message: timeout,
      }
      await Config.replaceOne({ feature: 'site' }, configData)
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: Error.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  mute([userID, type, amount]) {
    return new Promise<void>(async (resolve, reject) => {
      try {
        const userBan = await User.findOne({ _id: userID })
        if (!userBan) return reject({ code: Error.InvalidUser, message: 'INVALID_USER' })
        if (userBan.banLevel > 1) return reject({ code: Error.InvalidUser, message: 'INVALID_USER' })

        let banExp
        switch (type) {
          case 'min':
            banExp = moment().add(amount, 'm')
            break
          case 'hour':
            banExp = moment().add(amount, 'h')
            break
          case 'day':
            banExp = moment().add(amount, 'd')
            break
          default:
            reject({ code: Error.InvalidParams, message: 'INVALID_TIME_TYPE' })
            break
        }

        userBan.banLevel = 1
        userBan.banExp = banExp
        await userBan.save()
        this.purge(userID)
        resolve()
      } catch (e) {
        this.Logger.error(e)
        reject({ code: Error.InternalError, message: 'INTERNAL_ERROR' })
      }
    })
  }

  unmute(userID) {
    return new Promise<void>(async (resolve, reject) => {
      try {
        const userBan = await User.findOneAndUpdate({ _id: userID }, { banLevel: 0, banExp: null })
        if (!userBan || userBan.banLevel > 1) return reject({ code: Error.InvalidUser })
        resolve()
      } catch (e) {
        reject({ code: Error.InternalError, message: 'INTERNAL_ERROR' })
      }
    })
  }

  clearRoom(room) {
    const operations = this.chat[room].map(message => ({
      updateOne: { filter: { _id: message._id }, update: { deleted: true } },
    }))

    ChatMessage.bulkWrite(operations)

    this.chat[room] = []

    this.io.emit('chat.clear', room)
  }

  purge(userID) {
    const chat = {
      en: [],
      de: [],
      tr: [],
      ru: [],
      fr: [],
    }
    const operations = []
    Object.keys(this.chat).forEach(key => {
      this.chat[key].forEach(message => {
        if (message.user.user_id.toString() !== userID.toString()) chat[key].push(message)
        else operations.push({ updateOne: { filter: { _id: message._id }, update: { deleted: true } } })
      })
    })

    ChatMessage.bulkWrite(operations)
    this.chat = chat

    this.io.emit('chat.purge', userID)
  }

  verifyUser(userID) {
    return new Promise<void>(async (resolve, reject) => {
      try {
        await User.findOneAndUpdate({ _id: userID }, { rank: 1 })
        this.io.to(userID).emit('chat.verified', null)
        resolve()
      } catch (e) {
        this.Logger.error(e)
        reject({ code: Error.InternalError, message: 'INTERNAL_ERROR' })
      }
    })
  }

  unverifyUser(userID) {
    return new Promise<void>(async (resolve, reject) => {
      try {
        await User.findOneAndUpdate({ _id: userID }, { rank: 0 })
        resolve()
      } catch (e) {
        this.Logger.error(e)
        reject({ code: Error.InternalError, message: 'INTERNAL_ERROR' })
      }
    })
  }

  async resetAllRooms() {
    try {
      // TODO: Add this lol
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: Error.InternalError, message: 'INTERNAL_ERROR' })
    }
  }
  async toggleMaintenance() {
    try {
      Config.findOne({ feature: 'site' })
        .lean()
        .then(async config => {
          config.settings.maint.enabled = !config.settings.maint.enabled
          await Config.replaceOne({ feature: 'site' }, config)
        })
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: Error.InternalError, message: 'INTERNAL_ERROR' })
    }
  }
  async toggleCountdown() {
    try {
      Config.findOne({ feature: 'site' })
        .lean()
        .then(async config => {
          config.settings.countdown.enabled = !config.settings.countdown.enabled
          await Config.replaceOne({ feature: 'site' }, config)
        })
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: Error.InternalError, message: 'INTERNAL_ERROR' })
    }
  }
}
