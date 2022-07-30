import { ERROR } from '../constants/Errors'
import Reward from '../models/Reward'
import User from '../models/User'
import BaseService from './BaseService'
import Discord from './Discord'
import Util from '../utils'
import Transaction, { ETransactionCurrency, ETransactionState, ETransactionType } from '../models/Transaction'

export default class Rewards extends BaseService {
  io: any
  settings: any
  Settings: any
  Discord: any

  constructor(io, { Settings }) {
    super({ location: 'service/Rewards' })
    this.io = io
    this.Settings = Settings
    this.Discord = new Discord({})
    this.settings = null

    this._init()
  }

  private async _init() {
    this.Logger.info('CoinParty service started')
    this.settings = await this.Settings.getRewardSettings()
  }

  public async getTime(userId: string) {
    try {
      const user = await User.findOne({ _id: userId })
      if (!user) return Promise.reject({ code: ERROR.UserNotFound })

      const level = Util.getLevel(user.wagered ? user.wagered : 0)

      let rewardObj = null
      for (let i = 0; i < this.settings.rewards.length; i++) {
        if (this.settings.rewards[i].max >= level) {
          rewardObj = this.settings.rewards[i] || this.settings.rewards[0]
          break
        }
      }

      if (!rewardObj && this.settings.rewards[this.settings.rewards.length - 1].max <= level) {
        rewardObj = this.settings.rewards[this.settings.rewards.length - 1]
      }

      if (!rewardObj) return Promise.reject({ code: ERROR.RewardNotFound })

      const rewards = await Reward.find({
        userId,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      })
        .sort({ timestamp: -1 })
        .limit(1)

      if (!rewards || rewards.length === 0) return rewardObj
      return { date: rewards[0].createdAt, ...rewardObj }
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async getReward(userId: string) {
    try {
      const rewards = await Reward.find({
        userId,
        createdAt: {
          $lt: new Date(),
          $gte: new Date(new Date().getTime() - 24 * 60 * 60 * 1000),
        },
      })
        .sort({ createdAt: -1 })
        .limit(1)

      if (!rewards || rewards.length > 0) return Promise.reject({ code: ERROR.RewardAlreadyCollected })

      const user = await User.findOne({ _id: userId })

      const level = Util.getLevel(user.wagered ? user.wagered : 0)

      let rewardObj = null
      for (let i = 0; i < this.settings.rewards.length; i++) {
        if (this.settings.rewards[i].max >= level) {
          rewardObj = this.settings.rewards[i] || this.settings.rewards[0]
          break
        }
      }
      if (!rewardObj && this.settings.rewards[this.settings.rewards.length - 1].max <= level) {
        rewardObj = this.settings.rewards[this.settings.rewards.length - 1]
      }

      if (!rewardObj) rewardObj = this.settings.rewards[this.settings.rewards.length - 1]

      if (!rewardObj || rewardObj.reward === 0) return Promise.reject({ code: ERROR.RewardNotFound })

      const transaction = await Transaction.find({
        to_user_id: userId,
        type: ETransactionType.Deposit,
        amount: { $gte: rewardObj.wager },
      })

      if (!transaction) return Promise.reject({ code: ERROR.NotEnoughWagered })

      const reward = new Reward({
        userId,
        reward: rewardObj.reward,
        timestamp: new Date(),
      })
      reward.save()

      await User.findByIdAndUpdate(user._id, { $inc: { balance: rewardObj.reward } }, { new: true })

      await new Transaction({
        from_user_id: reward._id,
        to_user_id: user._id,
        amount: rewardObj.reward,
        currency: ETransactionCurrency.Balance,
        status: ETransactionState.Confirmed,
        type: ETransactionType.Reward,
      }).save()
      return reward.toObject()
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async updateRewardSettings(index, reward, wager) {
    await this.Settings.updateRewardSettings(index, reward, wager)
    this.settings = await this.Settings.getRewardSettings()
  }
}
