import BaseService from './BaseService'
import Config from '../models/Config'
import { ERROR } from '../constants/Errors'
import CoinPartyDB from '../models/CoinParty'
import Transaction, { ETransactionCurrency, ETransactionType, ETransactionState } from '../models/Transaction'
import { startSession } from 'mongoose'
import User from '../models/User'

export default class CoinParty extends BaseService {
  private isActive = false
  private settings: any
  private Settings: any
  private currentCoinParty: any
  private io: any
  private config: any
  private chat: any

  constructor(io, { Settings, Chat }) {
    super({ location: 'service/CoinParty' })
    this.io = io
    this.config = Config
    this.Settings = Settings
    this.chat = Chat
    this._init()
  }

  private async _init() {
    this.Logger.info('CoinParty service started')
    this.settings = await this.Settings.getCoinpartySettings()
  }

  public async createCoinParty(userId: any, amount: any) {
    if (this.isActive)
      return Promise.reject({ code: ERROR.CoinPartyAlreadyActive, message: 'COIN_PARTY_ALREADY_ACTIVE' })

    const user = await User.findById(userId)
    if (!user) return Promise.reject({ code: ERROR.UserNotFound, message: 'USER_NOT_FOUND' })

    if (user.balance < amount || amount < this.settings.min)
      return Promise.reject({ code: ERROR.UserNotEnoughBalance, message: 'USER_HAS_NOT_ENOUGH_BALANCE' })

    const session = await startSession()
    session.startTransaction()

    try {
      user.balance -= amount
      await user.save()

      // create new Transaction
      const transaction = await new Transaction({
        to_user_id: this.Config.admin.userId,
        from_user_id: user._id,
        amount,
        currency: ETransactionCurrency.Balance,
        type: ETransactionType.CoinPartyRewards,
        state: ETransactionState.Confirmed,
      }).save()

      this.currentCoinParty = await new CoinPartyDB({
        initiator: user.username,
        balance: amount,
        participants: [],
        transactions: [transaction._id],
      }).save()

      await session.commitTransaction()
      session.endSession()

      this.isActive = true
      setTimeout(() => {
        this.closeCoinParty()
      }, this.settings.timeLimit * 1000 || 2 * 60 * 1000)

      this.io.emit('coinparty.created', this.currentCoinParty.toObject())
      this.chat.botSendMessage(
        `${user.username} created a party with ${amount} coins! :tada: :POGGERS: :tada: :POGGERS: :tada: :POGGERS: :tada:`,
        'en'
      )
      return Promise.resolve({ coinparty: this.currentCoinParty, user })
    } catch (e) {
      this.Logger.error(e)
      await session.abortTransaction()
      session.endSession()
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR_CREATING_COIN_PARTY' })
    }
  }

  public async closeCoinParty() {
    if (!this.isActive) return Promise.reject({ code: ERROR.CoinPartyNotActive, message: 'COIN_PARTY_NOT_ACTIVE' })

    // send money to all participants
    const session = await startSession()
    session.startTransaction()

    for (const userId of this.currentCoinParty.participants) {
      const user = await User.findOne({ _id: userId })
      if (!user) continue

      user.balance += Math.floor(this.currentCoinParty.balance / this.currentCoinParty.participants.length)
      await user.save()

      const transaction = await new Transaction({
        to_user_id: userId,
        from_user_id: this.Config.admin.userId,
        amount: Math.floor(this.currentCoinParty.balance / this.currentCoinParty.participants.length),
        currency: ETransactionCurrency.Balance,
        type: ETransactionType.CoinPartyRewards,
        state: ETransactionState.Confirmed,
      }).save()

      this.currentCoinParty.transactions.push(transaction._id)
    }

    this.currentCoinParty.isFinished = true
    // this.currentCoinParty.save()
    await CoinPartyDB.updateOne({ _id: this.currentCoinParty._id }, this.currentCoinParty, { upsert: true })

    this.io.emit('coinparty.credited', this.currentCoinParty.toObject())
    this.chat.botSendMessage(
      `:pepeD: The Coinparty is over! :pepeD: ${this.currentCoinParty.participants.length} users have received ${this.currentCoinParty.balance} coins total!`,
      'en'
    )
    this.isActive = false
    this.currentCoinParty = null
    return Promise.resolve()
  }

  public async donateToCoinParty(userId: any, amount: any) {
    if (!this.isActive) return Promise.reject({ code: ERROR.CoinPartyNotActive, message: 'COIN_PARTY_NOT_ACTIVE' })

    const user = await User.findById(userId)
    if (!user) return Promise.reject({ code: ERROR.UserNotFound, message: 'USER_NOT_FOUND' })
    if (this.isRace(user._id.toString(), 2000)) return Promise.reject({ code: ERROR.TooFast, message: 'TOO_FAST' })

    if (user.balance < amount || amount < this.settings.min)
      return Promise.reject({ code: ERROR.UserNotEnoughBalance, message: 'USER_HAS_NOT_ENOUGH_BALANCE' })

    const session = await startSession()
    session.startTransaction()
    try {
      user.balance -= amount
      await user.save()

      // create new Transaction
      const transaction = await new Transaction({
        to_user_id: this.Config.admin.userId,
        from_user_id: user._id,
        amount,
        currency: ETransactionCurrency.Balance,
        type: ETransactionType.CoinPartyRewards,
        state: ETransactionState.Confirmed,
      }).save()

      this.currentCoinParty.transactions.push(transaction._id)
      this.currentCoinParty.balance += amount

      await session.commitTransaction()
      session.endSession()

      this.io.emit('coinparty.donated', { coinparty: this.currentCoinParty.toObject(), user: user.username, amount })
      this.chat.botSendMessage(
        `${user.username} hyped up the party with ${amount} coins! :tada: :POGGERS: :tada: :POGGERS: :tada: :POGGERS: :tada:`,
        'en'
      )
      return Promise.resolve({ user, coinparty: this.currentCoinParty })
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async joinCoinParty(userId: any) {
    if (!this.isActive) return Promise.reject({ code: ERROR.CoinPartyNotActive, message: 'COIN_PARTY_NOT_ACTIVE' })

    const user = await User.findById(userId).lean()
    if (!user) return Promise.reject({ code: ERROR.UserNotFound, message: 'USER_NOT_FOUND' })

    if (this.currentCoinParty.participants.some(id => id.toString() === user._id.toString()))
      return Promise.reject({ code: ERROR.CoinPartyAlreadyJoined, message: 'USER_ALREADY_JOINED_COIN_PARTY' })

    this.currentCoinParty.participants.push(user._id)

    this.io.to(user._id).emit('coinparty.joined', this.currentCoinParty.toObject())
    return Promise.resolve(this.currentCoinParty)
  }

  public async getCoinParty() {
    if (!this.isActive) return Promise.reject({ code: ERROR.CoinPartyNotActive, message: 'COIN_PARTY_NOT_ACTIVE' })
    return Promise.resolve(this.currentCoinParty)
  }
}
