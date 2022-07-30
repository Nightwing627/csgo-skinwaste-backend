/* eslint-disable no-param-reassign */
import Log from '../utils/Logger'
import JWT from './JWT'
import Util from '../utils'
import User, { EBanLevel } from '../models/User'
import { ERROR } from '../constants/Errors'

const { Logger } = new Log('service/Socket')

module.exports = (io, { Chat, Settings }) => {
  let onlineUsers = 0
  const spamScores = {}

  const updateScore = (key, value) => {
    return (spamScores[key] = Math.max((spamScores[key] || 0) + value, 0))
  }

  setInterval(() => {
    Object.keys(spamScores).forEach(key => {
      if (spamScores[key] > 0) updateScore(key, -1)
      else delete spamScores[key]
    })
  }, 1e3)

  let pl = {}

  setInterval(() => {
    pl = {}

    Object.values(io.sockets.connected).forEach(value => {
      const socket: any = value
      if (socket && socket.user && !pl[socket.user._id]) {
        pl[socket.user._id] = {
          id: socket.user._id,
          username: socket.user.username,
          avatar: socket.user.avatar,
          rank: socket.user.rank === 3 ? 0 : socket.user.rank,
        }
      }
    })

    io.emit('chat.connectedUsers', { online: onlineUsers, users: pl })
  }, 10e3)

  /* const clearRoom = room => {
    io.of('/')
      .in(room)
      .clients((err, sockets) => {
        if (err) return Logger.error(`clearRoom: ${err}`);
        sockets.forEach(id => io.sockets.sockets[id].leave(room));
      });
  }; */

  io.on('connection', async socket => {
    onlineUsers++

    io.emit('chat.connectedUsers', { online: onlineUsers, users: pl })

    const refreshUser = async () => {
      const token = socket.handshake.query.token || null
      const config = await Settings.getSiteSettings()
      try {
        if (token !== 'null') {
          const tokenDecoded: any = await JWT.validateToken(token)
          const user = await User.findById(tokenDecoded.data.id).lean()
          if (!user) {
            socket.user = null
            return
          }
          socket.user = user
          socket.join(user._id)
          if (socket.user && socket.user.banLevel === EBanLevel.Site) {
            socket.emit(
              'app.error',
              Util.responseObj({
                code: ERROR.Banned,
                message: 'USER_BANNED',
              })
            )
            // console.log('Banned')
            return socket.disconnect()
          }
          if (config.whitelist.enabled && (!socket.user || !config.whitelist.users.hasOwnProperty(socket.user._id))) {
            socket.emit(
              'app.error',
              Util.responseObj({
                code: ERROR.NotInWhitelist,
                message: 'NOT_WHITELISTED',
              })
            )
            // console.log('Whitelist')
            return socket.disconnect()
          }
          if (config.maint.enabled && (!socket.user || socket.user.rank < 2)) {
            socket.emit('err', Util.responseObj({ code: ERROR.Maintenance, message: config.maint.message }))
            // console.log('Maintenance')
            return socket.disconnect()
          }
        } else {
          return
        }
      } catch (e) {
        Logger.error(e)
        socket.emit('app.error', Util.responseObj(e))
      }
    }

    refreshUser()

    socket.on('chat.agreeRules', async cb => {
      if (!socket.user) return cb({ code: ERROR.NotLoggedIn, message: 'NOT_LOGGED_IN' })
      if (updateScore(socket.user._id, 2) >= 4) return cb({ code: ERROR.SocketSpam, message: 'SOCKET_SPAM' })

      try {
        await Chat.acceptChatRules(socket.user._id)
        await refreshUser()
        cb(null)
      } catch (e) {
        cb(e)
      }
    })

    socket.on('chat.sendMessage', async (data, cb) => {
      // console.log(data)
      if (!socket.user) return cb({ code: ERROR.NotLoggedIn, message: 'NOT_LOGGED_IN' })
      if (socket.user.rank === 0 && updateScore(socket.user._id, 2) >= 4)
        return cb({ code: ERROR.SocketSpam, message: 'SOCKET_SPAM' })
      try {
        await refreshUser()
        // console.log('makeit?')
        await Chat.sendMessage(socket.user, data.message, data.room)
        // console.log('???')
        cb(null)
      } catch (e) {
        // console.log('err', e)
        cb(e)
      }
    })

    socket.on('disconnect', () => {
      onlineUsers--
    })
  })
}
