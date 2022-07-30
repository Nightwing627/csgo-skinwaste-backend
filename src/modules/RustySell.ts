import config from 'config'
import { ERROR } from '../constants/Errors'
import RustySellOrder from '../models/RustySellOrder'
import User from '../models/User'
import BaseService from './BaseService'
import crypto from 'crypto'
import { startSession } from 'mongoose'
import Transaction, { ETransactionType, ETransactionState, ETransactionCurrency } from '../models/Transaction'

export enum ERustySellOrderState {
  Created = 'created',
  Pending = 'pending',
  Waiting = 'waiting',
  Error = 'error',
  Success = 'success',
}

export default class RustySell extends BaseService {
  Discord: any
  io: any
  url: string
  merchantId: string
  merchantSecret: string
  depositUrl: string
  balanceUrl: string
  orderUrl: string

  debugingObject: any[] = []

  constructor(io) {
    super({ location: 'service/RustySell' })

    this.io = io

    // this.Discord = new this.Discord({})

    this.url = `https://www.rustysell.com`

    this.merchantId = config.rustySell.merchantId
    this.merchantSecret = config.rustySell.merchantSecret

    this.depositUrl = `/api/merchant/${this.merchantId}/get_deposit_url`
    this.balanceUrl = `/api/merchant/${this.merchantId}/get_balance`
    this.orderUrl = `/api/merchant/${this.merchantId}/get_order`

    this.Request = this.Request.defaults({
      baseUrl: this.url,
    })
  }

  public async getDepositUrl(userId) {
    const user = await User.findOne({ _id: userId }).lean()

    if (!user.steamTrade) {
      return Promise.reject({ error: ERROR.InvalidTradeUrl, message: 'INVALID_TRADE_URL' })
    }

    const body = {
      tradeurl: `https://steamcommunity.com/tradeoffer/new/?partner=${user.steamTrade.partner}&token=${user.steamTrade.token}`,
      steamid: user.steamID,
    } as { tradeurl: string; steamid: string; signature?: string }

    body.signature = this.buildSignature(body, this.merchantSecret)

    const response = await this.Request.post(this.depositUrl, { body })

    const { data, error, message } = response

    const { signature } = data
    delete data.signature

    const builtSignature = this.buildSignature(data, this.merchantSecret)

    if (signature !== builtSignature) {
      this.Logger.error('INVALID SIGNATURE')
      return Promise.reject({ error: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }

    if (error) {
      this.Logger.error(message)
      return Promise.reject({ error: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }

    const { deposit_url, order_id, creation_time } = data

    await new RustySellOrder({
      user_id: userId,
      order_id,
      creation_time,
    }).save()

    return deposit_url
  }

  public async getBalance() {
    const response = await this.Request.get(this.balanceUrl)

    const { data, error, message } = response

    if (error) {
      this.Logger.error(message)
      return Promise.reject({ error: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }

    const { balance } = data

    return balance
  }

  public async getOrder(orderId) {
    const response = await this.Request.get(`${this.orderUrl}?order_id=${orderId}`)

    const { data, error, message } = response

    this.debugingObject.push(data)

    if (error) {
      this.Logger.error(message)
      return Promise.reject({ error: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }

    return data
  }

  public async verifySignature(data) {
    const { order_id, steamid, value, signature } = data

    this.debugingObject.push(data)

    const builtSignature = this.buildSignature(data, this.merchantSecret)

    if (signature !== builtSignature) {
      this.Logger.error('INVALID SIGNATURE')
      return Promise.reject({ error: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }

    const order = await RustySellOrder.findOne({ order_id })

    if (!order) {
      return Promise.reject({ error: ERROR.InvalidOrder, message: 'INVALID_ORDER' })
    }

    if (order.status === ERustySellOrderState.Success) return

    const user = await User.findOne({ steamID: steamid })

    if (!user) {
      return Promise.reject({ error: ERROR.InvalidUser, message: 'INVALID_USER' })
    }

    const session = await startSession()
    session.startTransaction()
    try {
      await User.findByIdAndUpdate(user._id, { $inc: { balance: +value } }, { new: true }).lean()
      order.status = ERustySellOrderState.Success
      order.value = value
      await order.save()

      const tx = await new Transaction({
        to_user_id: user._id,
        amount: value,
        currency: ETransactionCurrency.RustySell,
        type: ETransactionType.Deposit,
        status: ETransactionState.Confirmed,
        extra: {
          order_id,
        },
      }).save()

      this.io.to(user._id).emit('payments.pendingDeposit', tx.toObject())

      await session.commitTransaction()
    } catch (e) {
      await session.abortTransaction()
      this.Logger.error(e)
      this.debugingObject.push(e)
      return Promise.reject({ error: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    } finally {
      session.endSession()
    }
  }

  private sha256 = string => {
    return String(
      crypto
        .createHash('sha256')
        .update(string)
        .digest('hex')
    )
  }

  private buildSignature = (data, secret) => {
    let signatureString = ''

    Object.keys(data)
      .sort()
      .forEach(key => {
        if (key === 'signature') return
        if (typeof data[key] === 'object') return
        signatureString += data[key]
      })

    return this.sha256(`${signatureString}${secret}`)
  }

  public debuging() {
    return this.debugingObject
  }
}
