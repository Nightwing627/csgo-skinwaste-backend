import BaseService from './BaseService'
import { Waxpeer } from 'waxpeer'
import config from 'config'
import { startSession } from 'mongoose'
import { ERROR } from '../constants/Errors'
import Wax, { EWaxPeerStatus } from '../models/Wax'
import Transaction, { ETransactionCurrency, ETransactionType, ETransactionState } from '../models/Transaction'
import Discord from './Discord'
import User from '../models/User'
import Util from '../utils'

export default class WaxPeer extends BaseService {
  pollingInterval: number
  WaxPeer: Waxpeer
  WaxTradeIds: any[]
  Discord: any
  io: any

  constructor(io) {
    super({ location: 'service/WaxPeer' })

    this.io = io

    this.pollingInterval = 5e3
    this.WaxPeer = new Waxpeer(config.waxpeer.apiKey)
    this.Discord = new Discord({})
    this.Request = this.Request.defaults({
      baseUrl: 'https://api.waxpeer.com/v1',
      qs: {
        api: config.waxpeer.apiKey,
      },
    })

    this.WaxTradeIds = []

    this._init()
  }

  private async _init() {
    const trades = await Wax.find({ status: { $lte: EWaxPeerStatus.TradeSent } })
    this.WaxTradeIds = trades.map(trade => trade.waxPeerID.toString())
    setInterval(this.tradePoll.bind(this), this.pollingInterval)
  }

  public async tradePoll() {
    if (this.WaxTradeIds.length) {
      const trades = await this.getTradeStatuses(this.WaxTradeIds)
      for (const trade of trades) {
        await this.updateTradeStatus(trade)
      }
    }
  }

  public async buyItem(item, userID, userTradeData) {
    try {
      const trade: any = await this.WaxPeer.buyItemWithName(
        item.market_name,
        item.price * 10,
        userTradeData.token,
        userTradeData.partner
      )

      if (!trade.success)
        return Promise.reject({ code: ERROR.ItemNotAvailable, message: 'ITEM_NOT_AVAILABLE', errors: [item._id] })

      await new Wax({
        waxPeerID: trade.id,
        userID,
        itemID: item._id,
        waxPeerValue: (trade.price / 10).toFixed(0),
        valueCharged: item.price,
      }).save()

      this.WaxTradeIds.push(trade.id.toString())
    } catch (e) {
      this.Logger.error(e)
    }
  }

  private removeIDFromIDs(removeID) {
    this.WaxTradeIds = this.WaxTradeIds.filter(id => id !== removeID.toString())
  }

  public async updateTradeStatus(waxTrade) {
    const trade = await Wax.findOne({ waxPeerID: waxTrade.id })
    if (trade.status >= EWaxPeerStatus.TradeAccepted) {
      this.removeIDFromIDs(waxTrade.id)
      return
    }
    if (trade.status === 0 && waxTrade.status === EWaxPeerStatus.TradeSent) {
      trade.status = EWaxPeerStatus.TradeSent
      this.io.to(trade.userID).emit('trade.sent', { steamTradeID: waxTrade.trade_id })
      await trade.save()
      return
    }
    if (
      (trade.status === 0 && waxTrade.status && waxTrade.status === EWaxPeerStatus.TradeAccepted) ||
      (trade.status === EWaxPeerStatus.TradeSent && waxTrade.status === EWaxPeerStatus.TradeAccepted)
    ) {
      trade.status = EWaxPeerStatus.TradeAccepted
      await new Transaction({
        to_user_id: config.bot.admin,
        currency: ETransactionCurrency.Null,
        type: ETransactionType.CSGOProfit,
        status: ETransactionState.Confirmed,
        amount: trade.valueCharged - trade.waxPeerValue,
      }).save()
      await trade.save()
      this.removeIDFromIDs(waxTrade.id)
      this.Discord.Notification('CSGO Trade Accepted', '', 'Csgo', [
        { name: 'UserId', value: trade.userID },
        { name: 'WaxPeerId', value: trade.waxPeerID },
        {
          name: 'Profit',
          value: `$${((trade.valueCharged - trade.waxPeerValue) / 100).toFixed(2)}`,
        },
      ])
      return
    }

    if (
      (trade.status === 0 && waxTrade.status && waxTrade.status === EWaxPeerStatus.TradeDeclined) ||
      (trade.status === EWaxPeerStatus.TradeSent && waxTrade.status === EWaxPeerStatus.TradeDeclined)
    ) {
      const session = await startSession()
      session.startTransaction()
      try {
        trade.status = EWaxPeerStatus.TradeDeclined
        trade.save()

        await User.findByIdAndUpdate(trade.userID, { $inc: { balance: trade.valueCharged } }, { session })

        await new Transaction({
          to_user_id: trade.userID,
          from_user_id: config.bot.admin,
          type: ETransactionType.CSGORefund,
          currency: ETransactionCurrency.Balance,
          amount: trade.valueCharged,
          status: ETransactionState.Confirmed,
        }).save()

        await session.commitTransaction()
        session.endSession()
        this.io
          .to(trade.userID)
          .emit(
            'trade.declined',
            Util.responseObj({ code: ERROR.TradeDeclined, message: 'TRADE_DECLINED_OR_SELLER_DECLINED_AND_REFUNDED' })
          )
        this.Discord.Notification('CSGO Trade Declined', '', 'Csgo', [
          { name: 'UserId', value: trade.userID },
          { name: 'WaxPeerId', value: trade.waxPeerID },
          {
            name: 'Refunded',
            value: `$${(trade.valueCharged / 100).toFixed(2)}`,
          },
        ])
      } catch (e) {
        this.Logger.error(e)
        await session.abortTransaction()
        session.endSession()
        this.Discord.Notification('CSGOItem Refund Failed', '', 'Error', [
          { name: 'UserID', value: trade.userID },
          { name: 'WaxTradeID', value: trade._id },
          { name: 'Value Charged', value: (trade.valueCharged / 100).toFixed(2) },
        ])
      }

      this.removeIDFromIDs(waxTrade.id)
    }
  }

  public async getTradeStatuses(tradeIds) {
    const ids = tradeIds.map(id => `id=${parseInt(id, 10)}&`)
    const { trades } = await this.Request.get(`/check-many-steam?${ids.join('')}`)
    return trades
  }
}
