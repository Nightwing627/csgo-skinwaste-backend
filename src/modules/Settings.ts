import Config from '../models/Config'
import EventEmitter from 'events'
import Logger from '../utils/Logger'
import { ERROR } from '../constants/Errors'
import { IRouletteSettings } from './Roulette'
import { IJackpotSettings } from './Jackpot'

export default class Settings extends EventEmitter {
  Logger: any
  io: any

  constructor(io) {
    super()
    this.Logger = new Logger('services/Settings').Logger
    this.io = io

    setTimeout(() => this._init(), 5000)

    Config.watch().on('change', (data: any) => {
      if (data.fullDocument) {
        if (data.fullDocument.feature === 'site') {
          const siteSend = JSON.parse(JSON.stringify(data))
          delete siteSend.fullDocument.settings.internal
          this.io.emit('config.site', siteSend.fullDocument.settings)
        }
        this.emit(data.fullDocument.feature, data.fullDocument.settings)
      }
    })
  }

  public async _init() {
    const games = ['jackpot', 'silver', 'coinflip']
    for (const game of games) {
      this.Logger.info(game)
      const config = await Config.findOne({ feature: game }).lean()
      config.settings.enabled = true
      await Config.update({ feature: game }, config, { overwrite: true })
    }
  }

  public async createConfig(feature: string, settings: object) {
    try {
      const config = await new Config({
        feature,
        settings,
      }).save()

      return config
    } catch (e) {
      this.Logger.error(e)
      return { code: ERROR.InternalError, message: 'Internal Error' }
    }
  }

  public async getCoinflipSettings() {
    try {
      const { settings } = await Config.findOne({ feature: 'coinflip' }).lean()

      return settings
    } catch (e) {
      this.Logger.error(e)
      return null
    }
  }

  public async getCryptoSettings(site = true) {
    try {
      const { settings, updatedAt } = await Config.findOne({ feature: 'crypto' }).lean()
      if (site) {
        delete settings.rates.ETH.normal
        delete settings.rates.BTC.normal
        delete settings.rates.LTC.normal
        delete settings.rates.USDT.normal
        delete settings.rates.USDC.normal
      }
      return { ...settings, ...{ updatedAt } }
    } catch (e) {
      return null
    }
  }

  public async getJackpotsSettings() {
    try {
      const elite = await this.getJackpotConfig()
      const silver = await this.getSilverJackpotConfig()

      return { elite, silver }
    } catch (e) {
      this.Logger.error(e)
      return null
    }
  }

  public async getJackpotConfig(): Promise<IJackpotSettings | null> {
    try {
      const { settings } = await Config.findOne({ feature: 'jackpot' }).lean()
      return settings
    } catch (e) {
      this.Logger.error(e)
      return null
    }
  }

  public async getSilverJackpotConfig(): Promise<IJackpotSettings | null> {
    try {
      const { settings } = await Config.findOne({ feature: 'silver' }).lean()
      return settings
    } catch (e) {
      this.Logger.error(e)
      return null
    }
  }

  public async getAffiliateSettings() {
    try {
      const { settings } = await Config.findOne({ feature: 'affiliate' }).lean()
      return settings
    } catch (e) {
      this.Logger.error(e)
      return null
    }
  }

  public async getPromoSettings() {
    try {
      const { settings } = await Config.findOne({ feature: 'promo' }).lean()
      return settings
    } catch (e) {
      this.Logger.error(e)
      return null
    }
  }

  public async getRouletteConfig(): Promise<IRouletteSettings | null> {
    try {
      const { settings } = await Config.findOne({ feature: 'roulette' }).lean()
      return settings
    } catch (e) {
      this.Logger.error(e)
      return null
    }
  }

  public async getSiteSettings(site = false): Promise<any | null> {
    try {
      const { settings } = await Config.findOne({ feature: 'site' }).lean()
      if (site) {
        delete settings.internal
      }
      return settings
    } catch (e) {
      this.Logger.error(e)
      return null
    }
  }

  public async getLeaderboardSettings() {
    try {
      const { settings } = await Config.findOne({ feature: 'leaderboard' }).lean()
      return settings
    } catch (e) {
      this.Logger.error(e)
      return null
    }
  }

  public async updateLeaderboardSettings(totalWinners: number, rewards: number[]) {
    try {
      const { settings } = await Config.findOne({ feature: 'leaderboard' }).lean()
      settings.totalWinners = totalWinners
      settings.rewards = rewards
      await Config.update(
        { feature: 'leaderboard' },
        { feature: 'leaderboard', settings, updatedAt: new Date() },
        { overwrite: true }
      )
    } catch (e) {
      this.Logger.error(e)
    }
  }

  public async getCoinpartySettings() {
    try {
      const { settings } = await Config.findOne({ feature: 'coinparty' }).lean()
      return settings
    } catch (e) {
      this.Logger.error(e)
      return null
    }
  }

  public async getRouletteSettings() {
    try {
      const { settings } = await Config.findOne({ feature: 'roulette' }).lean()
      return settings
    } catch (e) {
      this.Logger.error(e)
      return null
    }
  }

  public async getRewardSettings() {
    try {
      const { settings } = await Config.findOne({ feature: 'reward' }).lean()
      return settings
    } catch (e) {
      this.Logger.error(e)
      return null
    }
  }

  public async updateRewardSettings(index, reward, wager = -1) {
    const { settings } = await Config.findOne({ feature: 'reward' }).lean()

    settings.rewards[index] = reward
    if (wager !== -1) {
      settings.wagers[index] = wager
    }

    await Config.update(
      { feature: 'reward' },
      { feature: 'reward', settings, updatedAt: new Date() },
      { overwrite: true }
    )
  }

  public async toggleCountdown() {
    try {
      const { settings } = await Config.findOne({ feature: 'site' }).lean()
      settings.countdown.enabled = !settings.countdown.enabled
      await Config.update(
        { feature: 'site' },
        { feature: 'site', settings, updatedAt: new Date() },
        { overwrite: true }
      )
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'Internal Error' })
    }
  }

  public async getCountdown() {
    try {
      const { settings } = await Config.findOne({ feature: 'site' }).lean()
      return settings.countdown
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'Internal Error' })
    }
  }

  public async setCountdown(countdown: string) {
    if (isNaN(Date.parse(countdown)) || Date.parse(countdown) < Date.now()) {
      return Promise.reject({ code: ERROR.InvalidCountdown, message: 'Invalid Countdown' })
    }
    try {
      const { settings } = await Config.findOne({ feature: 'site' }).lean()
      settings.countdown.end = countdown
      await Config.update(
        { feature: 'site' },
        { feature: 'site', settings, updatedAt: new Date() },
        { overwrite: true }
      )
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'Internal Error' })
    }
  }
}
