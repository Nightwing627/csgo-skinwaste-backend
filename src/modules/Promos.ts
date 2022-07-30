import { ERROR } from '../constants/Errors'
import Promo from '../models/Promo'
import User from '../models/User'
import BaseService from './BaseService'
import Discord from './Discord'

export default class Promos extends BaseService {
  io: any
  settings: any
  Settings: any
  Discord: any

  constructor(io, { Settings }) {
    super({ location: 'service/Promo' })
    this.io = io
    this.Settings = Settings
    this.Discord = new Discord({})
    this.settings = null

    this.Settings.on('promo', data => {
      this.Logger.info('PROMO SETTINGS UPDATED')
      this.settings = data
      this.io.emit('config.promo', data)
    })

    this._updateSettings()
  }

  private async _updateSettings() {
    this.settings = await this.Settings.getPromoSettings()
  }

  public async setCode(userId, code, reward, maxUse = -1) {
    try {
      code = code
        .toString()
        .toLowerCase()
        .trim()

      code = code.replace(/[^A-Za-z0-9-]+/gi, '')

      if (code.length < 3 || code.length > 18)
        return Promise.reject({ code: ERROR.InvalidParams, message: 'INVALID_CODE' })

      reward = parseInt(reward, 10)

      if (reward <= 0) return Promise.reject({ code: ERROR.InvalidAmount, message: 'INVALID_AMOUNT' })

      const promo = await Promo.findOne({ code }).lean()

      if (promo) return Promise.reject({ code: ERROR.CodeInUse, message: 'CODE_TAKEN' })

      await new Promo({
        code,
        reward,
        maxUse,
      }).save()

      await this.LogAction({
        user_id: userId,
        action: 'Created Promocode',
        data: { code, reward, maxUse },
      })
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async deleteCode(userId, id) {
    try {
      const promo = await Promo.findOneAndUpdate({ _id: id }, { active: false })
      if (!promo) return Promise.reject({ code: ERROR.NotFound, message: 'AFFILIATE_NOT_FOUND' })

      await this.LogAction({
        user_id: userId,
        action: 'Deleted Promo Code',
        data: { deletedPromoCode: id },
        ip: 'internal',
      })
    } catch (e) {
      this.Logger.info(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async getAllCodes(page = 1, perPage = 20) {
    try {
      return await Promo.paginate({ active: true }, { lean: true, page, perPage, sort: { createdAt: -1 } })
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async useCode(userId, code) {
    try {
      if (this.isRace(userId.toString(), 3000)) return Promise.reject({ code: ERROR.TooFast, message: 'TOO_FAST' })

      code = code
        .toString()
        .toLowerCase()
        .trim()

      code = code.replace(/[^A-Za-z0-9-]+/gi, '')

      const promo = await Promo.findOne({ code, active: true })

      if (!promo) return Promise.reject({ code: ERROR.InvalidParams, message: 'INVALID_CODE' })

      if (promo.users.includes(userId)) {
        return Promise.reject({ code: ERROR.PromoAlreadyRedeemed, message: 'PROMO_ALREADY_REDEEMED' })
      }

      if (promo.users.length >= promo.maxUse && promo.maxUse !== -1) {
        return Promise.reject({ code: ERROR.PromoMaxUse, message: 'PROMO_MAX_USE' })
      }

      promo.users.push(userId)
      await promo.save()
      await User.findOneAndUpdate({ _id: userId }, { $inc: { balance: promo.reward } })

      await this.LogAction({
        user_id: userId,
        action: 'Used Promocode',
        data: { code, reward: promo.reward },
        ip: 'internal',
      })
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }
}
