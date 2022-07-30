import url from 'url'
import BaseService from './BaseService'
import Backpack from '../models/Backpack'
import config from 'config'
import { ERROR } from '../constants/Errors'
import UserM, { EBanLevel } from '../models/User'
import Transaction, { ETransactionCurrency, ETransactionType } from '../models/Transaction'
import Affiliate from '../models/Affiliate'
import Bet from '../models/Bet'
import Util from '../utils'
import { Types } from 'mongoose'
import Action from '../models/Action'
import ICrypto from './Crypto'
import moment from 'moment'
import RouletteM, { ERouletteState } from '../models/Roulette'
export default class User extends BaseService {
  Jackpot: any
  SilverJackpot: any
  Crypto: ICrypto

  constructor({ Jackpot, SilverJackpot, Crypto }) {
    super({ location: 'service/User' })
    this.Jackpot = Jackpot
    this.SilverJackpot = SilverJackpot
    this.Crypto = Crypto
  }

  public async verifyUser(userId, actionByUserId) {
    try {
      const user = await UserM.findByIdAndUpdate(userId, { rank: 1 })
      if (!user) return Promise.reject({ code: ERROR.UserNotFound, message: 'USER_NOT_FOUND' })

      await new Action({
        actionBy: actionByUserId,
        actionId: userId,
        action: 'verifyUser',
      }).save()
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async updateBanLevel(userId, banLevel: EBanLevel) {
    try {
      const query: any = { banLevel }
      if (banLevel === EBanLevel.Chat) {
        query.banExp = new Date(
          moment()
            .add(10, 'y')
            .toDate()
        )
      }
      return await UserM.findByIdAndUpdate(userId, query, { new: true }).lean()
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async getUserByIdOrSteamID(id) {
    try {
      let query
      if (Types.ObjectId.isValid(id)) query = { _id: id }
      else query = { steamID: id }
      const user = await UserM.findOne(query)
        .populate('affiliateUsedId')
        .lean()
      user.level = Util.getLevel(user.wagered ? user.wagered : 0)
      return user
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async getInventory(userId) {
    try {
      const bets = {}
      if (this.Jackpot.pendingBets.length) {
        for (const bet of this.Jackpot.pendingBets) {
          if (!bets[bet.userID]) bets[bet.userID] = bet.backpackIds
          else bets[bet.userID] = new Set([...bets[bet.userID], ...bet.backpackIds])
        }
      }

      if (this.SilverJackpot.pendingBets.length) {
        for (const bet of this.SilverJackpot.pendingBets) {
          if (!bets[bet.userID]) bets[bet.userID] = bet.backpackIds
          else bets[bet.userID] = new Set([...bets[bet.userID], ...bet.backpackIds])
        }
      }
      return await Backpack.find({ _id: { $nin: bets[userId] || [] }, user_id: userId, deleted: { $exists: false } })
        .populate('item_id')
        .lean()
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: this.Error.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async getCryptoAddress(currency, userID, newAddress = false) {
    if (!config.isAppProd()) newAddress = true
    try {
      if (!Object.values(ETransactionCurrency).includes(currency))
        return Promise.reject({ code: ERROR.InvalidParams, message: 'INVALID_CURRENCY' })

      const user = await UserM.findById(userID)

      if (
        !newAddress &&
        user?.cryptoAddresses[currency] &&
        user?.addressUpdated[currency]?.dateUpdated &&
        moment(user.addressUpdated[currency].dateUpdated)
          .add(60, 'days')
          .toDate() >= new Date()
      ) {
        return { address: user.cryptoAddresses[currency] }
      }

      const nonce = user.addressUpdated[currency]?.nonce ? user.addressUpdated[currency].nonce++ : 0

      const { address } = await this.Crypto.getCallbackAddress(userID, currency, nonce)

      user.addressUpdated[currency] = {
        nonce,
        dateUpdated: new Date(),
      }

      if (!user.cryptoAddresses) user.cryptoAddresses = {}
      user.cryptoAddresses[currency] = address
      user.markModified('cryptoAddresses')
      user.markModified('addressUpdated')
      await user.save()

      return { address }
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async getUsedAffiliateCode(affiliateId) {
    try {
      const { code } = await Affiliate.findById(affiliateId)
        .select('code')
        .lean()
      return code
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async getBetHistory(userId, game = null, page = 1, perPage = 20) {
    try {
      const query: any = { user: userId }
      switch (game) {
        case 'elite':
          query.gameType = 'jackpot'
          break
        case 'ez':
          query.gameType = 'catcher'
          break
        default:
          query.gameType = game
      }
      const bets = await Bet.paginate(query, { lean: true, page, perPage, sort: { createdAt: -1 } })

      const games = []
      if (game === 'roulette') {
        for (let i = 0; i < bets.data.length; i++) {
          const _game = await RouletteM.find({ _id: bets.data[i].game, state: ERouletteState.Completed })
          games.push(_game[0])
        }
      }
      // console.log({ ...bets, games })
      return { ...bets, games }
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async getUserPaymentHistory(userId, transactionTypes: number[], page = 1, perPage = 20) {
    try {
      const viewableTransactionType = [
        ETransactionType.AffiliateWithdrawal,
        ETransactionType.AffiliateDeposit,
        ETransactionType.AffiliateEliteDeposit,
        ETransactionType.ItemPurchase,
        ETransactionType.ItemSale,
        ETransactionType.Winnings,
        ETransactionType.Withdraw,
        ETransactionType.Deposit,
        ETransactionType.Sponsor,
        ETransactionType.Giveaway,
        ETransactionType.Operations,
        ETransactionType.CSGOPurchase,
        ETransactionType.CSGORefund,
      ]

      this.Logger.info(viewableTransactionType)

      for (const type of transactionTypes) {
        if (!viewableTransactionType.includes(type)) {
          return Promise.reject({ code: ERROR.InvalidParams, message: `INVALID_PARAMS_${type}` })
        }
      }

      return await Transaction.paginate(
        {
          $or: [{ to_user_id: userId }, { from_user_id: userId }],
          type: {
            $in: transactionTypes,
          },
        },
        { lean: true, page, perPage, sort: { createdAt: -1 } }
      )
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async updateSteamTradeUrl(userID, tradeUrl) {
    try {
      tradeUrl = tradeUrl.trim()
      const regex = /^https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?partner=[0-9]*&token=[a-zA-Z0-9_-]{8}$/i
      if (!tradeUrl.match(regex)) return Promise.reject({ code: ERROR.InvalidTradeUrl, message: 'INVALID_TRADE_URL' })
      const parseUrl = url.parse(tradeUrl, true)
      const { partner, token } = parseUrl.query as { partner: string; token: string }

      if (!partner || !token) return Promise.reject({ code: ERROR.InvalidTradeUrl, message: 'INVALID_TRADE_URL' })

      return await UserM.findByIdAndUpdate(userID, { steamTrade: { partner, token } }, { new: true }).lean()
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async changeRank(userID, rank) {
    try {
      const user = await UserM.findById(userID)
      if (!user) return Promise.reject({ code: ERROR.UserNotFound, message: 'USER_NOT_FOUND' })

      user.rank = rank
      await user.save()

      return user
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }
}
