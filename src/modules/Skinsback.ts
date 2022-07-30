import config from 'config'
import { ERROR } from '../constants/Errors'
import SkinsBackOrder from '../models/SkinsBackOrder'
import User from '../models/User'
import BaseService from './BaseService'
import crypto from 'crypto'
import mongoose from 'mongoose'

import axios from 'axios'
import Transaction, { ETransactionCurrency, ETransactionState, ETransactionType } from '../models/Transaction'

import APIDebugger from '../models/APIDebugger'

export enum ESkinsBackOrderState {
  Created = 'created',
  Pending = 'pending',
  Waiting = 'waiting',
  Error = 'error',
  Success = 'success',
}

interface ISkinsBackBody {
  method?: string
  shopid: string
  sign?: string
  order_id: string
  steam_id?: string
  trade_token?: string
  currency?: string
  result_url?: string
  fail_url?: string
  success_url?: string
}

interface ISkinsBackResponse {
  sign: string
  status: string // success, pending, error
  transactions_id: string
  order_id: string
  steam_id: string
  date: number // Unix time
  amount?: number // only success | The amount that the user deposited in the currency 'currency'.
  amount_currency?: string // only success | The currency that the user deposited.
  amount_in_currencies?: any // only success | Refill amount in all available currencies.
  user_amount?: number // only success | The amount that the user deposited multiplied by the value from the project settings
  user_amount_in_currencies?: object // only success | The amount that the user deposited multiplied by the value from the project settings in all available currencies.
  offer_date?: number
  skins_send_data?: number
  skins?: any // only success | An array that contains information about the received skins: name, price, and price with a multiplier.
}

interface ISkinsBackBalanceResponse {
  balance: number // Project balance in roubles.
  balance_in_currencies: object // Balance converted into various currencies.
  deals_sum: number // The total amount of transactions (in roubles)
  deals_sum_in_currencies: object // The total amount of transactions converted into various currencies.
  withdraw_sum: number // The total amount of withdrawals (in roubles)
  withdraw_sum_in_currencies: object // The total amount of withdrawals converted into various currencies.
}

export default class SkinsBack extends BaseService {
  io: any
  Discord: any

  projectID: string
  projectSecret: string

  url: string
  createOrderURL: string

  localURL: string

  Settings: any

  depositWagerRate: any

  debugingObject: any[] = []

  constructor(io: any, { Settings }: any) {
    super({ location: 'service/SkinsBack' })

    this.depositWagerRate = 0

    this.io = io
    this.Settings = Settings
    // this.Discord = new this.Discord({})

    this.url = `https://bill.skinsback.com/api.php`

    this.projectID = config.skinsBack.projectID
    this.projectSecret = config.skinsBack.projectSecret

    this.Settings.on('site', data => {
      const { depositWageredPercent } = data.internal
      this.depositWagerRate = depositWageredPercent
    })
  }

  public async debug() {
    const info = await APIDebugger.find({ location: 'skinsback' })
    return info
  }

  public async getDepositUrl(userId: any) {
    const user = await User.findOne({ _id: userId }).lean()
    if (!user.steamTrade) {
      return Promise.reject({ error: ERROR.InvalidTradeUrl, message: 'INVALID_TRADE_URL' })
    }
    let response = null
    try {
      const order = new SkinsBackOrder({
        user_id: user._id,
        state: ESkinsBackOrderState.Created,
      })

      const query = ({
        method: 'create',
        shopid: this.projectID,
        order_id: order._id.toString(),
        steam_id: user.steamID,
        trade_token: user.steamTrade.token,
      } as unknown) as ISkinsBackBody

      query.sign = this.buildSignature(query, this.projectSecret)

      response = await axios.post('https://bill.skinsback.com/api.php', query)

      const { data } = response

      order.url = data.url
      order.transactions_id = data.transactions_id
      await order.save()

      return data
    } catch (e) {
      const { error_code, error_message } = e.response.data
      this.Logger.error(e)
      return Promise.reject({ error_code, error_message })
    }
  }

  public async getBalance() {
    try {
      const query = {
        method: 'balance',
        shopid: this.projectID,
      } as { method: string; shopid: string; sign?: string }

      let response = null
      query.sign = this.buildSignature(query, this.projectSecret)

      response = await axios.post('https://bill.skinsback.com/api.php', query)

      const { data }: { data: ISkinsBackBalanceResponse } = response

      return data
    } catch (e) {
      const { error_code, error_message } = e.response.data

      return Promise.reject({ error_code, error_message })
    }
  }

  public async getPricelist(game = 'csgo') {
    try {
      const query = {
        method: 'market_pricelist',
        shopid: this.projectID,
        game, // or 'dota2'
        // full: true, // get full list of items
        // extended: true, // get more details about item
      } as { method: string; shopid: string; game: string; full: boolean; extended: boolean; sign?: string }

      let response = null
      query.sign = this.buildSignature(query, this.projectSecret)

      response = await axios.post('https://bill.skinsback.com/api.php', query)

      const {
        data,
      }: {
        data: {
          last_update: number
          items: {
            name: string
            price: number
            classid: string
            count: number
            [x: string]: any
          }[]
        }
      } = response

      return data
    } catch (e) {
      const { error_code, error_message } = e.response.data

      return Promise.reject({ error_code, error_message })
    }
  }

  public async searchItem(game: string, names: string[]) {
    try {
      const query = {
        method: 'market_search',
        shopid: this.projectID,
        search: 'AK-47',
        game,
        names,
      } as {
        method: string
        shopid: string
        search: string
        game: string
        names: string[]
        sign?: string
      }

      let response = null
      query.sign = this.buildSignature(query, this.projectSecret)

      response = await axios.post('https://bill.skinsback.com/api.php', query)

      const {
        data,
      }: {
        data: {
          items: {
            name: string
            price: number
            classid: string
            instanceid: string
            [x: string]: any
          }[]
        }
      } = response

      return data
    } catch (e) {
      const { error_code, error_message } = e.response.data

      return Promise.reject({ error_code, error_message })
    }
  }

  public async buyItem(userId: string, item: any) {
    try {
      const user = await User.findOne({ _id: userId }).lean()
      if (!user.steamTrade) {
        return Promise.reject({ error: ERROR.InvalidTradeUrl, message: 'INVALID_TRADE_URL' })
      }

      const order = new SkinsBackOrder({
        user_id: user._id,
        state: ESkinsBackOrderState.Created,
      })
      order.save()

      const query = {
        method: 'market_buy',
        shopid: this.projectID,
        partner: user.steamTrade.partner,
        token: user.steamTrade.token,
        id: item.id,
        max_price: item.price,
        custom_id: order._id,
      } as {
        method: string
        shopid: string
        partner: string
        token: string
        id: string
        max_price: number
        custom_id: string
        sign?: string
      }

      query.sign = this.buildSignature(query, this.projectSecret)

      const response = await axios.post('https://bill.skinsback.com/api.php', query)

      const {
        data,
      }: {
        data: {
          item: {
            id: number
            name: string
            price: number
            classid: string
            instanceid: string
          }
          buy_id: string
          offer_status: string
          balance_debited_sum: number
        }
      } = response

      return data
    } catch (e) {
      const { error_code, error_message } = e.response.data

      return Promise.reject({ error_code, error_message })
    }
  }

  public async handleCallback(query: any) {
    try {
      await this.verifySignature(query)

      await this.getOrder(query)
    } catch (e) {
      this.Logger.error(e)
    }
  }

  private async getOrder(query: ISkinsBackResponse | any) {
    try {
      const order = await SkinsBackOrder.findById(query.order_id)

      if (!order) return Promise.reject({ error: ERROR.InvalidOrder, message: 'INVALID_ORDER' })

      const checkTx = await Transaction.findOne({
        foreign_trx_id: order.transactions_id.toString(),
        status: ETransactionState.Confirmed,
      }).lean()

      if (checkTx) return Promise.reject({ error: ERROR.InternalError, message: 'ORDER_ALREADY_CONFIRMED' })

      if (query.status !== 'success')
        return Promise.reject({ error: ERROR.InternalError, message: 'ORDER_WASNT_SUCCESSFULL' })

      const user = await User.findById(order.user_id)
      if (!user) return Promise.reject({ error: ERROR.InvalidUser, message: 'INVALID_USER' })

      const amount = query.amount_currency === 'usd' ? query.amount : query.amount_in_currencies.usd

      const value = Math.floor(parseFloat(amount) * 100)

      const session = await mongoose.startSession()
      session.startTransaction()
      const needToWager = value * this.depositWagerRate
      const total = value

      order.amount = value
      order.status = ESkinsBackOrderState.Success
      order.amount_in_currencies = query.amount_in_currencies
      await order.save()

      user.balance += total
      if (user.deposited) user.deposited += total
      else user.deposited = total

      if (user.amountBeforeWithdrawal) {
        user.amountBeforeWithdrawal += needToWager
      } else {
        user.amountBeforeWithdrawal = needToWager
      }
      await user.save({ session })

      await SkinsBackOrder.findOneAndUpdate(
        { foreign_trx_id: order.transactions_id.toString(), to_user_id: user._id },
        { status: ESkinsBackOrderState.Success, amount: total },
        { session, new: true }
      )

      await new Transaction({
        to_user_id: order.user_id,
        amount: total,
        currency: ETransactionCurrency.SkinsBack,
        type: ETransactionType.Deposit,
        status: ETransactionState.Confirmed,
        foreign_trx_id: order.transactions_id,
        extra: {
          skins: query.skins,
          skins_send_data: query.skins_send_data,
          offer_date: query.offer_date,
        },
      }).save()

      await session.commitTransaction()
      session.endSession()

      this.io.to(user._id).emit('payments.completeDeposit', { amount: total })
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ error: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async verifySignature(query: any) {
    const signature = this.buildSignature(query, this.projectSecret)
    if (signature !== query.sign) {
      this.Logger.error('INVALID_SIGNATURE')
      return Promise.reject({ error: ERROR.InternalError, message: 'INVALID_SIGNATURE' })
    }
    return true
  }

  public async getFailedCallbackResults() {
    try {
      const query = {
        method: 'callback_error_list',
        shopid: this.projectID,
      } as { method: string; shopid: string; sign?: string }

      let response = null
      query.sign = this.buildSignature(query, this.projectSecret)

      response = await axios.post('https://bill.skinsback.com/api.php', query)

      const { data } = response

      this.Logger.debug(data)
    } catch (e) {
      const { error_code, error_message } = e.response.data
      this.Logger.error({ error_code, error_message })
    }
  }

  private buildSignature = (params: ISkinsBackBody | ISkinsBackResponse | any, secretKey: crypto.BinaryLike) => {
    let paramsString = ''
    Object.keys(params)
      .sort()
      .forEach(function(key) {
        if (key === 'sign') {
          return
        }
        if (typeof params[key] === 'object') {
          return
        }
        paramsString += '' + key + ':' + params[key] + ';'
      })

    paramsString = crypto
      .createHmac('sha1', secretKey)
      .update(paramsString)
      .digest('hex')

    return paramsString
  }
}
