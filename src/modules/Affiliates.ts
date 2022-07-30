import BaseService from './BaseService'
import User, { EBanLevel } from '../models/User'
import Affiliate, { IAffiliate } from '../models/Affiliate'
import { ERROR } from '../constants/Errors'
import { startSession } from 'mongoose'
import Transaction, { ETransactionCurrency, ETransactionState, ETransactionType } from '../models/Transaction'
import Discord from './Discord'
import moment = require('moment')

export default class Affiliates extends BaseService {
  io: any
  settings: any
  Settings: any
  Discord: any

  constructor(io, { Settings }) {
    super({ location: 'service/Affiliates' })
    this.io = io
    this.Settings = Settings
    this.Discord = new Discord({})
    this.settings = null

    this.Settings.on('affiliate', data => {
      this.Logger.info('AFFILIATE SETTINGS UPDATED')
      this.settings = data
      this.io.emit('config.affiliate', data)
    })

    this._updateSettings()
  }

  private async _updateSettings() {
    this.settings = await this.Settings.getAffiliateSettings()
  }

  public async getData(userId) {
    try {
      return await Affiliate.findOne({ user_id: userId }).lean()
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async upgradeToElite(userId, actionByUserId) {
    try {
      const affiliate = await Affiliate.findOneAndUpdate({ user_id: userId }, { elite: true })
      if (!affiliate) return Promise.reject({ code: ERROR.NotFound, message: 'AFFILIATE_NOT_FOUND' })

      await this.LogAction({
        user_id: userId,
        action: 'upgradeUserToElite',
        data: { actionBy: actionByUserId },
        ip: 'internal',
      })
    } catch (e) {
      this.Logger.info(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async setCode(code, userID) {
    try {
      code = code
        .toString()
        .toLowerCase()
        .trim()

      code = code.replace(/[^A-Za-z0-9]+/gi, '')

      if (code.length < 3 || code.length > 18)
        return Promise.reject({ code: ERROR.InvalidParams, message: 'INVALID_CODE' })

      const aff = await Affiliate.findOne({ user_id: userID })
      const codeCheck = await Affiliate.findOne({ code }).lean()
      if (codeCheck) return Promise.reject({ code: ERROR.CodeInUse, message: 'CODE_TAKEN' })
      if (this.Filter.isProfane(code))
        return Promise.reject({ code: ERROR.Profanity, message: 'PROFANITY_NOT_ALLOWED' })
      if (!aff) {
        return await new Affiliate({
          user_id: userID,
          code,
        }).save()
      }

      aff.code = code
      await aff.save()

      return aff
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  private async checkAffiliateLevelUp(affiliate: IAffiliate) {
    const { tiers } = this.settings
    const tierUp = tiers[affiliate.level + 1]
    const currentTier = tiers[affiliate.level]

    if (affiliate.totalUsersReferred >= tierUp.user || affiliate.referralsWagered >= tierUp.wagered) {
      affiliate.level++
      await affiliate.save()
    }

    if (affiliate.totalUsersReferred < currentTier.user && affiliate.referralsWagered < currentTier.wagered) {
      affiliate.level--
      await affiliate.save()
    }

    return affiliate
  }

  public async updateUserAffiliateCode(affiliateID, userID) {
    return User.findByIdAndUpdate(userID, {
      affiliateUsedId: affiliateID,
      affiliateLockTill: new Date(
        moment()
          .add(this.settings.daysBeforeAffiliateChange, 'days')
          .toISOString()
      ),
    })
  }

  public async removeUserFromPreviousAffiliate(affiliateID, session) {
    const affiliate = await Affiliate.findById(affiliateID)

    if (!affiliate) return

    affiliate.totalUsersReferred--

    if (!affiliate.levelOverride) await this.checkAffiliateLevelUp(affiliate)

    affiliate.save({ session })
  }

  public async useCode(code, userID) {
    code = code.toString().toLowerCase()
    const session = await startSession()
    session.startTransaction()
    try {
      const affiliate = await Affiliate.findOne({ code, user_id: { $ne: userID } })

      if (!affiliate) return Promise.reject({ code: ERROR.InvalidCode, message: 'INVALID_CODE' })

      const user = await User.findById(userID)
      const affUser = await User.findById(affiliate.user_id).lean()
      const affUserReq = await Affiliate.findOne({ user_id: userID }).lean()

      const eliteCheck = affUserReq?.elite === true && affiliate.elite === true

      if (eliteCheck || (user.rank === 1 && affUser.rank === 1))
        return Promise.reject({ code: ERROR.InvalidCode, message: 'INVALID_CODE' })

      if (user.affiliateUsedId) await this.removeUserFromPreviousAffiliate(user.affiliateUsedId, session)

      affiliate.totalUsersReferred++

      if (!affiliate.levelOverride) await this.checkAffiliateLevelUp(affiliate)

      await affiliate.save({ session })

      await this.updateUserAffiliateCode(affiliate._id, userID)

      await session.commitTransaction()
      session.endSession()
    } catch (e) {
      this.Logger.error(e)
      await session.abortTransaction()
      session.endSession()
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  // public async increaseAffiliateDepositCount(affiliateId) {
  //   try {
  //     await Affiliate.findByIdAndUpdate(affiliateId, { $inc: { referralDeposits: 1 } })
  //   } catch (e) {
  //     this.Logger.error(e)
  //   }
  // }

  public async addWageredAmount(affiliateID, amount) {
    try {
      const affiliate = await Affiliate.findByIdAndUpdate(
        affiliateID,
        { $inc: { referralsWagered: amount } },
        { new: true }
      )

      if (!affiliate) {
        this.Logger.error('AFFILIATE NOT FOUND', affiliate.user_id)
        return
      }

      const user = await User.findById(affiliate.user_id).lean()

      if (!user) {
        this.Logger.error('AFFILIATE USER NOT FOUND', affiliate.user_id)
        return
      }

      if (user?.banLevel === EBanLevel.Site) return

      if (!affiliate.levelOverride) await this.checkAffiliateLevelUp(affiliate)
    } catch (e) {
      this.Logger.error(e)
    }
  }

  public async ifEliteGiveReward(pot, affiliateId, winnerId) {
    let reward
    try {
      const affiliate = await Affiliate.findOne({ _id: affiliateId, elite: true })
      const checkIfWinnerElite = await Affiliate.countDocuments({ user_id: winnerId, elite: true })

      if (checkIfWinnerElite) return 0
      if (!affiliate) return 0

      const user = await User.findById(affiliate.user_id).lean()

      if (!user) {
        this.Logger.error('AFFILIATE USER NOT FOUND', affiliate.user_id)
        return 0
      }

      if (user?.banLevel === EBanLevel.Site) return 0

      reward = parseInt((pot * this.settings.elite.percent_rake).toFixed(2), 10)

      await new Transaction({
        to_user_id: affiliate.user_id,
        amount: reward,
        currency: ETransactionCurrency.Balance,
        type: ETransactionType.AffiliateEliteDeposit,
        status: ETransactionState.Confirmed,
        extra: {
          affiliateId,
        },
      }).save()

      affiliate.earnings += reward
      affiliate.balance += reward
      await affiliate.save()
      return reward
    } catch (e) {
      this.Discord.Notification('ERROR ELITE Affiliate Payout', '', 'Error', [
        {
          name: 'AffiliateID',
          value: affiliateId,
        },
        {
          name: 'Amount',
          value: reward,
        },
        {
          name: 'Location',
          value: 'Affiliate/ifEliteGiveReward()',
        },
        {
          name: 'Error',
          value: e.message,
        },
        {
          name: 'Ping',
          value: ['admins'],
        },
      ])
    }
  }

  public async addBalanceFromWageredAmount(affiliateID, amount) {
    try {
      const { tiers } = this.settings
      const affiliate = await Affiliate.findById(affiliateID)

      if (!affiliate) return this.Logger.error({ code: ERROR.NotFound, message: 'AFFILIATE_NOT_FOUND' })

      const user = await User.findById(affiliate.user_id).lean()

      if (!user) {
        this.Logger.error('AFFILIATE USER NOT FOUND', affiliate.user_id)
        return 0
      }

      if (user?.banLevel === EBanLevel.Site) return 0

      const { bonus } = tiers[affiliate.level]

      const balance = parseInt((amount * bonus).toFixed(0), 10)

      if (balance > 0) {
        await new Transaction({
          to_user_id: affiliate.user_id,
          amount: balance,
          currency: ETransactionCurrency.Balance,
          type: ETransactionType.AffiliateDeposit,
          status: ETransactionState.Confirmed,
          extra: {
            affiliateId: affiliateID,
          },
        }).save()

        affiliate.earnings += balance
        affiliate.balance += balance
        await affiliate.save()
        return balance
      }

      return 0
    } catch (e) {
      this.Logger.error(e)
      return 0
    }
  }

  public async withdrawAffiliateBalanceToSiteBalance(userID) {
    if (this.isRace(userID.toString(), 1500)) return Promise.reject({ code: ERROR.TooFast, message: 'TOO_FAST' })
    const session = await startSession()
    session.startTransaction()
    try {
      const affiliate = await Affiliate.findOne({ user_id: userID })
      const amount = affiliate.balance

      if (affiliate.balance < 0) return Promise.reject({ code: ERROR.InsufficientFunds, message: 'INSUFFICIENT_FUNDS' })

      const user = await User.findById(userID)

      if ([EBanLevel.Site].includes(user.banLevel))
        return Promise.reject({ code: ERROR.Banned, message: 'USER_BANNED' })

      affiliate.balance = 0
      await affiliate.save({ session })

      user.balance += amount
      await user.save({ session })

      await new Transaction({
        to_user_id: userID,
        amount,
        currency: ETransactionCurrency.Balance,
        type: ETransactionType.AffiliateWithdrawal,
        status: ETransactionState.Confirmed,
        extra: {
          affiliateId: affiliate._id,
        },
      }).save()

      await session.commitTransaction()
      session.endSession()

      return { affiliateBalance: affiliate.balance, userBalance: user.balance }
    } catch (e) {
      await session.abortTransaction()
      session.endSession()
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  async updateAffiliateReferredUsers(offset = 0) {
    try {
      const batchSize = 100
      let moreUsers = true

      while (moreUsers) {
        this.Logger.debug('here__________________________')
        const affiliates = await Affiliate.find({})
          .limit(batchSize)
          .skip(offset)
        this.Logger.debug(affiliates)

        if (affiliates.length < batchSize) moreUsers = false

        for (const affiliate of affiliates) {
          const count = await User.countDocuments({ affiliateUsedId: affiliate._id })
          this.Logger.debug(count)
        }

        this.updateAffiliateReferredUsers(affiliates.length)
      }
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async getAllCodes(page = 1, perPage = 20) {
    try {
      const codes = await Affiliate.paginate({ active: true }, { lean: true, page, perPage, sort: { createdAt: -1 } })
      codes.data.forEach(async (code: any) => {
        code.user = await User.findById(code.user_id)
      })
      this.Logger.debug(codes)
      return
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }
}
