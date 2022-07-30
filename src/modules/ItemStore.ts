import BaseService from './BaseService'
import Item from '../models/Item'
import { ERROR } from '../constants/Errors'
import User from '../models/User'
import { startSession, Types } from 'mongoose'
import { totp } from 'notp'
import base32 from 'thirty-two'
import csgoParser from 'csgo-item-name-parser'
import Backpack from '../models/Backpack'
import Transaction, { ETransactionCurrency, ETransactionState, ETransactionType } from '../models/Transaction'
import Util from '../utils'
import config from 'config'
import _ from 'lodash'
import moment from 'moment'

export default class ItemStore extends BaseService {
  Payments: any
  Settings: any
  io: any
  cashoutEnabled: boolean
  csgoCashoutEnabled: boolean
  csgoItemMarkup: number
  withdrawalApprovalAmount: number
  RequestWaxPeer: any
  Wax: any
  Race: any
  Discord: any

  constructor(Crypto, Settings, io, Wax, Discord) {
    super({ location: 'service/ItemStore' })

    this.Payments = Crypto
    this.Settings = Settings
    this.Wax = Wax
    this.io = io
    this.Discord = Discord

    this.cashoutEnabled = false
    this.csgoCashoutEnabled = false
    this.csgoItemMarkup = 1.15
    this.withdrawalApprovalAmount = 10000
    this.RequestWaxPeer = this.Request.defaults({
      baseUrl: 'https://api.waxpeer.com/v1',
      qs: { api: config.waxpeer.apiKey },
    })

    this._init()

    this.Settings.on('site', data => {
      this.csgoCashoutEnabled = data.enabled.csgo
      this.cashoutEnabled = data.enabled.withdraw
      this.csgoItemMarkup = data.internal.csgoMarkup
      this.withdrawalApprovalAmount = data.internal.withdrawalApprovalAmount
    })

    this.Race = {}
  }

  private async _init() {
    try {
      const { enabled, internal } = await this.Settings.getSiteSettings()

      this.csgoItemMarkup = internal.csgoMarkup
      this.csgoCashoutEnabled = enabled.csgo
      this.cashoutEnabled = enabled.withdraw
      this.withdrawalApprovalAmount = internal.withdrawalApprovalAmount

      this.Logger.info(this.withdrawalApprovalAmount)
    } catch (e) {
      this.Logger.error(e)
    }
  }

  public async getActiveItems() {
    try {
      return await Item.find({ active: true }).lean()
    } catch {
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  parseUser(user) {
    return {
      user_id: user._id,
      username: user.username,
      steamid: user.steamID,
      avatar: user.avatar,
      rank: user.rank === 3 ? 0 : user.rank,
      level: Util.getLevel(user.wagered ? user.wagered : 0),
    }
  }

  public async tipItems(backpackIds, fromUserID, toUserID) {
    if (this.isRace(fromUserID.toString(), 1500)) return Promise.reject({ code: ERROR.TooFast, message: 'TOO_FAST' })
    if (fromUserID === toUserID) return Promise.reject({ code: ERROR.InvalidParams, message: 'INVALID_USER_T0' })
    const session = await startSession()
    session.startTransaction()
    try {
      const items = await Backpack.find({
        _id: { $in: backpackIds },
        user_id: fromUserID,
        deleted: { $exists: false },
        sold: { $exists: false },
      })
        .populate('item_id')
        .lean()

      const itemArr = items.map(item => item.item_id)

      if (backpackIds.length !== items.length)
        return Promise.reject({ code: ERROR.InvalidItems, message: 'INVALID_ITEMS' })

      const totalItemsValue = items.reduce((a, b) => a + b.item_id.price, 0)

      const user = await User.findById(toUserID)
      const owner = await User.findById(fromUserID).lean()

      if (!user) return Promise.reject({ code: ERROR.InvalidUser, message: 'USER_NOT_FOUND' })

      const { n: matchedCount, nModified: modifiedCount } = await Backpack.updateMany(
        { _id: { $in: backpackIds }, user_id: fromUserID },
        { user_id: toUserID },
        { session }
      )

      if (matchedCount !== backpackIds.length || modifiedCount !== backpackIds.length)
        return Promise.reject({ code: ERROR.InvalidItems, message: 'INVALID_ITEMS' })

      if (!user.amountBeforeWithdrawal) user.amountBeforeWithdrawal = totalItemsValue
      else user.amountBeforeWithdrawal += totalItemsValue
      await user.save({ session })

      const tx = await new Transaction({
        to_user_id: toUserID,
        from_user_id: fromUserID,
        skins: backpackIds,
        amount: totalItemsValue,
        currency: ETransactionCurrency.Skins,
        type: ETransactionType.Tip,
        status: ETransactionState.Confirmed,
      }).save()

      await session.commitTransaction()
      session.endSession()

      this.io.emit('app.tipped', { to: this.parseUser(user), from: this.parseUser(owner), items: itemArr })

      return tx
    } catch (e) {
      await session.abortTransaction()
      session.endSession()
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async buyItems(itemIds, userID) {
    if (this.isRace(userID.toString(), 2000)) return Promise.reject({ code: ERROR.TooFast, message: 'TOO_FAST' })
    const session = await startSession()
    session.startTransaction()
    try {
      const items = await Item.find({ _id: { $in: itemIds }, active: true }).lean()

      if (items.length !== [...new Set(itemIds)].length)
        return Promise.reject({ code: ERROR.InvalidItems, message: 'INVALID_ITEMS' })

      let totalCost = 0
      const backpacks = []
      const backpackIds = []

      for (const id of itemIds) {
        for (const item of items) {
          if (item._id.toString() === id) {
            const backpack = new Backpack({
              user_id: userID,
              item_id: item._id,
            })
            totalCost += item.price
            backpacks.push(backpack)
            backpackIds.push(backpack._id)
          }
        }
      }

      const user = await User.findByIdAndUpdate(
        userID,
        { $inc: { balance: -totalCost } },
        { new: true, session }
      ).lean()

      if (user.balance < 0) return Promise.reject({ code: ERROR.InsufficientFunds, message: 'INSUFFICIENT_FUNDS' })

      await Backpack.insertMany(backpacks)

      await new Transaction({
        to_user_id: userID,
        skins: backpackIds,
        amount: totalCost,
        currency: ETransactionCurrency.Skins,
        type: ETransactionType.ItemPurchase,
        status: ETransactionState.Confirmed,
      }).save()

      await session.commitTransaction()
      session.endSession()

      return { balance: user.balance }
    } catch (e) {
      await session.abortTransaction()
      session.endSession()
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async sellItems(backpackIds, userID) {
    if (this.isRace(userID.toString(), 2000)) return Promise.reject({ code: ERROR.TooFast, message: 'TOO_FAST' })

    const session = await startSession()
    session.startTransaction()
    try {
      const items = await Backpack.find({
        _id: { $in: backpackIds },
        user_id: userID,
        deleted: { $exists: false },
        sold: { $exists: false },
      })
        .populate('item_id')
        .lean()

      if (backpackIds.length !== items.length)
        return Promise.reject({ code: ERROR.InvalidItems, message: 'INVALID_ITEMS' })

      const totalItemsValue = items.reduce((a, b) => a + b.item_id.price, 0)
      const user = await User.findByIdAndUpdate(userID, { $inc: { balance: totalItemsValue } }, { new: true, session })

      const { n: matchedCount, nModified: modifiedCount } = await Backpack.updateMany(
        { _id: { $in: backpackIds }, user_id: userID },
        { sold: true, deleted: true },
        { session }
      )

      if (matchedCount !== backpackIds.length || modifiedCount !== backpackIds.length)
        return Promise.reject({ code: ERROR.InvalidItems, message: 'INVALID_ITEMS' })

      new Transaction({
        to_user_id: userID,
        skins: backpackIds,
        amount: totalItemsValue,
        currency: ETransactionCurrency.Skins,
        type: ETransactionType.ItemSale,
        status: ETransactionState.Confirmed,
      }).save()

      await session.commitTransaction()
      session.endSession()

      return { balance: user.balance }
    } catch (e) {
      await session.abortTransaction()
      session.endSession()
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async cashOut(amount: number, userID, currency, address) {
    if (this.isRace(userID.toString(), 2000)) return Promise.reject({ code: ERROR.TooFast, message: 'TOO_FAST' })
    if (!this.cashoutEnabled) return Promise.reject({ code: ERROR.AdminLock, message: 'WITHDRAWALS_DISABLED' })
    const session = await startSession()
    session.startTransaction()
    try {
      const addressCheck = await User.findOne({ [`cryptoAddresses.${currency.toUpperCase()}`]: address }).lean()

      if (addressCheck) {
        await session.abortTransaction()
        session.endSession()
        return Promise.reject({ code: ERROR.BlockDepositAddress, message: 'BLOCK_DEPOSIT_ADDRESS' })
      }

      let amountWithFees = amount
      if (currency === 'eth') {
        const gasPrice = await this.Payments.getEthGasPrice(address, amount)
        amountWithFees += gasPrice * 100
      }

      const user = await User.findById(userID)

      if (user.balance < amount) {
        await session.abortTransaction()
        session.endSession()
        return Promise.reject({ code: ERROR.InsufficientFunds, message: 'INSUFFICIENT_FUNDS' })
      }
      if (user.amountBeforeWithdrawal > 10) {
        await session.abortTransaction()
        session.endSession()
        return Promise.reject({
          code: ERROR.NotEnoughWagered,
          message: 'NOT_ENOUGH_WAGERED',
          errors: { toWager: user.amountBeforeWithdrawal - 10 },
        })
      }

      user.balance -= amountWithFees
      await user.save({ session })

      const start = moment()
        .subtract(24, 'hours')
        .toISOString()
      const end = moment().toISOString()

      const countCashouts = await Transaction.countDocuments({
        $or: [{ to_user_id: userID }, { from_user_id: userID }],
        type: { $in: [ETransactionType.Withdraw, ETransactionType.CSGOPurchase] },
        createdAt: { $gte: start, $lte: end },
      })
      const countPending = await Transaction.countDocuments({
        $or: [{ to_user_id: userID }, { from_user_id: userID }],
        type: { $in: [ETransactionType.CSGOPurchase, ETransactionType.Withdraw] },
        status: ETransactionState.New,
        createdAt: { $gte: start, $lte: end },
      })

      if (countPending > 0) {
        await session.abortTransaction()
        session.endSession()
        return Promise.reject({ code: ERROR.PendingApproval, message: 'PENDING_CASHOUT_IN_PROGRESS' })
      }

      if (amount >= this.withdrawalApprovalAmount || countCashouts >= 5) {
        const tx = await new Transaction({
          to_user_id: userID,
          amount,
          type: ETransactionType.Withdraw,
          status: ETransactionState.New,
          currency: currency.toUpperCase(),
          extra: {
            address,
          },
        }).save()
        await this.Discord.sendWithdrawalApproval(user, tx)
        await session.commitTransaction()
        session.endSession()

        return { balance: user.balance, approval: true }
      }

      await session.commitTransaction()
      session.endSession()

      await this.Payments.createWithdrawRequest(userID, address, amount, currency)

      return { balance: user.balance }
    } catch (e) {
      await session.abortTransaction()
      session.endSession()
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async updateItemsAndPrices() {
    try {
      const code = totp.gen(base32.decode('MPETWOLNF55M26ZB'))
      const bitSkinsPayload = await this.Request.get(
        `https://bitskins.com/api/v1/get_all_item_prices/?api_key=18ddc6b1-117c-443a-a47e-675849696cfe&app_id=730&code=${code}`
      )
      const steamApisPayload = await this.Request.get(
        `http://api.steamapis.com/market/items/730?api_key=${this.Config.steamapi.key}`
      )

      const bitSkinsPrices = []

      for (const item of bitSkinsPayload.prices) {
        bitSkinsPrices[item.market_hash_name] = item.price
      }
      let updatedItems = 0
      let newItems = 0

      for (const item of steamApisPayload.data) {
        const itemDb = await Item.findOne({ market_name: item.market_name })

        const price = parseInt(
          String(
            ((parseFloat(bitSkinsPrices[item.market_name] || item.prices.safe) + parseFloat(item.prices.safe)) / 2) *
              this.csgoItemMarkup *
              100
          ),
          10
        )

        let color = item.border_color || '#D2D2D2'

        if (!color.match(/#([0-9]|[a-f]|[A-F]){6}/g)) {
          color = '#' + color
        }
        if (!itemDb) {
          const itemData = csgoParser(item.market_name)

          if (!item.image) continue

          await new Item({
            market_name: item.market_name,
            image: item.image,
            color,
            price: !price ? 0 : price,
            weapon: itemData.weapon,
            skin: itemData.skin,
            wear: itemData.wear,
            active: false,
          }).save()
          newItems++
        } else {
          itemDb.price = !price ? 0 : price
          itemDb.color = color
          await itemDb.save()
          updatedItems++
        }
      }

      this.Logger.info(`ITEM PRICE UPDATE - Updated Skins: ${updatedItems} | New Skins: ${newItems}`)
    } catch (e) {
      this.Logger.error(e.message)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async getWAXPeerItems() {
    try {
      const { items } = await this.RequestWaxPeer.get(`/prices?game=csgo`)
      // console.log(items.length)

      const nameArray = []

      for (const item of items) {
        nameArray[item.name] = item.avg
      }

      const dbItems = await Item.find(
        { market_name: { $in: Object.keys(nameArray) }, image: { $ne: null }, color: { $ne: null } },
        { market_name: 1, image: 1, color: 1, price: 1, weapon: 1, skin: 1, wear: 1 }
      ).lean()

      const returnArray = []
      for (const dbItem of dbItems) {
        if (nameArray[dbItem.market_name] / 10 <= dbItem.price) returnArray.push(dbItem)
      }

      return _.sortBy(returnArray, 'price')
    } catch (e) {
      this.Logger.error(e)
    }
  }

  public async requestItemFromWAXPeer(userID: Types.ObjectId, itemIDs: [], approvalRun = false, txId = null) {
    this.Logger.info(userID, itemIDs, approvalRun, txId)
    if (this.isRace(userID.toString(), 2000)) return Promise.reject({ code: ERROR.TooFast, message: 'TOO_FAST' })
    if (!this.csgoCashoutEnabled) return Promise.reject({ code: ERROR.AdminLock, message: 'WITHDRAWALS_DISABLED' })
    const session = await startSession()
    session.startTransaction()
    try {
      const user = await User.findById(userID)

      if (!user) return Promise.reject({ code: ERROR.UserNotFound, message: 'USER_NOT_FOUND' })
      if (!user?.steamTrade?.partner || !user?.steamTrade?.token)
        return Promise.reject({ code: ERROR.InvalidUser, message: 'MISSING_STEAM_INFO' })
      if (user.amountBeforeWithdrawal > 10)
        return Promise.reject({
          code: ERROR.NotEnoughWagered,
          message: 'NOT_ENOUGH_WAGERED',
          errors: { toWager: user.amountBeforeWithdrawal - 10 },
        })

      const items = await Item.find({ _id: { $in: itemIDs } }).lean()
      if (items.length !== itemIDs.length) return Promise.reject({ code: ERROR.InvalidItems, message: 'INVALID_ITEMS' })

      const itemValue = items.reduce((a, b) => a + b.price, 0)
      if (!approvalRun) {
        if (user.balance < itemValue)
          return Promise.reject({ code: ERROR.InsufficientFunds, message: 'INSUFFICIENT_FUNDS' })

        user.balance -= itemValue

        await user.save({ session })
      }

      const start = moment()
        .subtract(24, 'hours')
        .toISOString()
      const end = moment().toISOString()

      const countCashouts = await Transaction.countDocuments({
        $or: [{ to_user_id: userID }, { from_user_id: userID }],
        type: { $in: [ETransactionType.Withdraw, ETransactionType.CSGOPurchase] },
        createdAt: { $gte: start, $lte: end },
      })

      const countPending = await Transaction.countDocuments({
        $or: [{ to_user_id: userID }, { from_user_id: userID }],
        status: ETransactionState.New,
        type: { $in: [ETransactionType.CSGOPurchase, ETransactionType.Withdraw] },
        createdAt: { $gte: start, $lte: end },
      })

      if (countPending > 0 && !approvalRun) {
        await session.abortTransaction()
        session.endSession()
        return Promise.reject({ code: ERROR.PendingApproval, message: 'PENDING_CASHOUT_IN_PROGRESS' })
      }

      if ((itemValue >= this.withdrawalApprovalAmount || countCashouts >= 5) && !approvalRun) {
        const tx = await new Transaction({
          to_user_id: config.admin.userId,
          from_user_id: userID,
          type: ETransactionType.CSGOPurchase,
          currency: ETransactionCurrency.Balance,
          csgoSkins: items.map(item => item._id),
          amount: itemValue,
          status: ETransactionState.New,
          extra: {
            skins: items.map(item => item.market_name),
          },
        }).save()

        await this.Discord.sendWithdrawalApproval(user, tx)

        await session.commitTransaction()
        session.endSession()

        return { approval: true, balance: user.balance }
      }
      let totalPriceFailedItems = 0
      const itemsTraded = []
      const itemsFailed = []

      for (const item of items) {
        try {
          await this.Wax.buyItem(item, user._id, user.steamTrade)
          itemsTraded.push(item._id)
        } catch (e) {
          this.Logger.error(e)
          totalPriceFailedItems += item.price
          itemsFailed.push(item._id)
        }
      }

      user.balance += totalPriceFailedItems

      await user.save({ session })

      if (itemsTraded.length > 0) {
        if (!approvalRun) {
          await new Transaction({
            to_user_id: config.admin.userId,
            from_user_id: userID,
            type: ETransactionType.CSGOPurchase,
            currency: ETransactionCurrency.Balance,
            csgoSkins: itemsTraded,
            amount: itemValue - totalPriceFailedItems,
            status: ETransactionState.Confirmed,
          }).save()
        } else {
          await Transaction.findByIdAndUpdate(
            txId,
            {
              status: ETransactionState.Confirmed,
              csgoSkins: itemsTraded,
              amount: itemValue - totalPriceFailedItems,
            },
            { session }
          )
        }

        await session.commitTransaction()
        session.endSession()

        this.Discord.Notification('CSGO Cashout', '', 'Csgo', [
          { name: 'UserId', value: userID },
          { name: 'Username', value: user.username },
          {
            name: 'Skins',
            value: items.map(item => item.market_name).join(', '),
          },
          {
            name: 'Value Charged',
            value: `$${((itemValue - totalPriceFailedItems) / 100).toFixed(2)}`,
          },
          {
            name: 'Items Being "Traded"',
            value: itemsTraded.length ? itemsTraded.join(', ') : 'None',
          },
          {
            name: 'Items Unavailable',
            value: itemsFailed.length ? itemsFailed.join(', ') : 'None',
          },
        ])

        if (approvalRun) {
          this.io.to(userID).emit('trade.requested', {
            itemsTraded: items.filter(item => itemsTraded.indexOf(item._id) !== -1),
            itemsFailed: items.filter(item => itemsFailed.indexOf(item._id) !== -1),
          })
        }

        return { itemsTraded, itemsFailed }
      }
      if (itemsTraded.length === 0 && approvalRun) {
        user.balance += totalPriceFailedItems
        await user.save({ session })
        await Transaction.findByIdAndUpdate(
          txId,
          {
            status: ETransactionState.Confirmed,
            csgoSkins: [],
            amount: totalPriceFailedItems,
          },
          { session }
        )
        await new Transaction({
          to_user_id: userID,
          from_user_id: config.admin.userId,
          type: ETransactionType.CSGORefund,
          currency: ETransactionCurrency.Balance,
          amount: totalPriceFailedItems,
          status: ETransactionState.Confirmed,
        }).save()

        this.io.to(userID).emit('trade.requested', {
          itemsTraded: items.filter(item => itemsTraded.indexOf(item._id) !== -1),
          itemsFailed: items.filter(item => itemsFailed.indexOf(item._id) !== -1),
        })

        return { itemsTraded, itemsFailed }
      }
      await session.abortTransaction()
      session.endSession()
      return Promise.reject({ code: ERROR.ItemNotAvailable, message: 'TRADE_ITEM_UNAVAILABLE' })
    } catch (e) {
      await session.abortTransaction()
      session.endSession()
      this.Logger.error(e)
    }
  }
}
