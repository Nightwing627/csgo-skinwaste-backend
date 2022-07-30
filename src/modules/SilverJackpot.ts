import BaseService from './BaseService'
import User, { EBanLevel, IUser, userDataToGameData } from '../models/User'
import JackpotModel, { EJackpotState, IJackpot } from '../models/SilverJackpot'
import Bet, { EGameSelection, IBets } from '../models/Bet'
import { ERROR } from '../constants/Errors'
import { startSession, Types } from 'mongoose'
import _ from 'lodash'
import Backpack from '../models/Backpack'
import Util from '../utils'
import Transaction, { ETransactionCurrency, ETransactionState, ETransactionType } from '../models/Transaction'

export interface IPreviousWinner {
  user: IUser
  round: number
  percent: number
  won: number
}

export interface IJackpotPlayers {
  [key: string]: IUser
}

export interface IJackpotSettings {
  enabled: boolean
  maxPlayers: number
  maxItemsPerPlayer: number
  maxItems: number
  antiSnipe: boolean
  roundTimeLimit: number
  animationTime: number
  minBet: number
  antiSnipeTime: number
  lastBetTime: number
  maxBet: number
  rake: number
}

interface IJackpotBetRanges {
  [key: string]: [number[]]
}

export default class SilverJackpot extends BaseService {
  public players: IJackpotPlayers

  public bets: IBets[]

  private betRanges: IJackpotBetRanges

  private settings: IJackpotSettings

  public currentGame: IJackpot | null

  private enabled: boolean

  private io: any

  private provably: any
  private Affiliate: any
  private Settings: any
  private Discord: any

  private pendingCount: number
  public pendingBets: any

  private roundTimeout: null | NodeJS.Timeout

  private secondsTillRoll: number

  constructor(io, { Provably, Affiliate, Settings, Discord }) {
    super({ location: 'service/SilverJackpot' })

    this.players = {}
    this.bets = []
    this.settings = null

    this.io = io
    this.provably = Provably
    this.Affiliate = Affiliate
    this.Settings = Settings
    this.Discord = Discord

    this.currentGame = null

    this.enabled = false

    this.roundTimeout = null
    this.secondsTillRoll = 0

    this.pendingCount = 0
    this.pendingBets = []

    this.Settings.on('silver', data => {
      this.Logger.info('SILVER SETTINGS UPDATED')
      this.settings = data
      this.io.emit('config.elite', this.settings)
    })

    this.Settings.on('site', ({ enabled }) => {
      this.enabled = enabled.silver
    })

    this._init()
  }

  /**
   * TODO: Need to finish running init for all states of the game
   * @private
   */
  private async _init() {
    try {
      this.settings = await this.Settings.getSilverJackpotConfig()
      const { enabled } = await this.Settings.getSiteSettings()

      this.enabled = enabled.silver

      this.currentGame = await JackpotModel.findOne({ state: { $ne: EJackpotState.Completed } }).lean()
      if (!this.currentGame) await this.createGame()
      await this.retrievePlayersAndBets()

      if (this.currentGame.state === EJackpotState.Rolling) this.takeRakeAndGivePrize()
      if (this.currentGame.state === EJackpotState.BettingClosed) return this.blockBets()
      if (this.currentGame.state === EJackpotState.Active) {
        if (this.currentGame.endTime < Date.now()) return this.blockBets()
        setTimeout(() => this.blockBets(), this.currentGame.endTime - Date.now())
      }
      if (this.currentGame.state === EJackpotState.Waiting && _.size(this.players) >= 2) this.startGame(false)
    } catch (e) {
      this.Logger.error(e)
    }
  }

  private sleep(ms) {
    return new Promise(resolve => {
      setTimeout(() => resolve(), ms)
    })
  }

  private async retrievePlayersAndBets() {
    try {
      const bets: IBets[] = await Bet.find({ game: this.currentGame._id })
        .populate('user')
        .lean()
      bets.forEach((betData: IBets) => {
        const bet = betData
        const user = userDataToGameData(bet.user)
        bet.user = user._id
        if (!this.players[user._id]) {
          this.players[user._id] = user
        }

        this.currentGame.pot += bet.amount

        this.bets.push(bet)
      })
    } catch (e) {
      this.Logger.error(e)
    }
  }

  private async createGame() {
    try {
      const serverSeed = this.provably.generateServerSeed()
      this.currentGame = (
        await new JackpotModel({
          unencodedServerHash: serverSeed,
          gameHash: this.Util.genGameHash(serverSeed),
        }).save()
      ).toObject()
      this.players = {}
      this.bets = []
      this.pendingCount = 0
      this.currentGame.pot = 0
      if (this.pendingBets.length)
        for (const bet of this.pendingBets) {
          try {
            await this.placeBet(bet.userID, bet.backpackIds, true)
          } catch (e) {
            this.Logger.error(e)
          }
        }

      this.pendingBets = []
      this.io.emit('jackpot.newRound', this.socketResponse(this.getGameData(false, false)))
    } catch (e) {
      this.Logger.error(e)
    }
  }

  public async getHistory() {
    try {
      const buildData = []
      const jackpots = await JackpotModel.find({ state: EJackpotState.Completed })
        .sort({ _id: -1 })
        .limit(30)
        .lean()
      for (const jackpot of jackpots) {
        const bets = await Bet.find({ game: jackpot._id })
          .sort({ createdAt: 1 })
          .populate('user')
          .lean()
        const players = {}
        for (let i = 0; i < bets.length; i++) {
          const bet = bets[i]
          if (!players[bet.user._id]) players[bet.user._id] = userDataToGameData(bet.user)
          bets[i].user = bet.user._id
        }
        buildData.push({ ...jackpot, ...{ bets }, ...{ players } })
      }

      return buildData
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'Internal Error' })
    }
  }

  public getGameData(justGame: boolean, endGame = false): object {
    const gameData = this.currentGame

    if (gameData.state === EJackpotState.Active || gameData.state === EJackpotState.BettingClosed)
      gameData.secondsTillRoll = gameData.endTime - Date.now()

    if (!endGame) {
      delete gameData.unencodedServerHash
      delete gameData.createdAt
      delete gameData.updatedAt
      delete gameData.randomJson
      delete gameData.randomHash
      delete gameData.signature
      delete gameData.roll
    }
    if (justGame) {
      return gameData
    }
    return { ...gameData, ...{ players: this.players }, ...{ bets: this.bets } }
  }

  public async placeBet(userID: Types.ObjectId, backpackIds, pendingBet = false) {
    if (this.isRace(userID.toString(), 2000) && !pendingBet)
      return Promise.reject({ code: ERROR.TooFast, message: 'TOO_FAST' })
    if (!this.enabled) return Promise.reject({ code: ERROR.AdminLock, message: 'ADMIN_LOCKED' })

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

      const bets = await Bet.find({ user: userID, game: this.currentGame._id }).lean()

      if (items.length !== backpackIds.length || !items.length)
        return Promise.reject({ code: ERROR.InvalidItems, message: 'INVALID_ITEMS' })

      if (this.currentGame.state !== EJackpotState.Waiting && this.currentGame.state !== EJackpotState.Active) {
        this.pendingBets.push({ userID, backpackIds })
        return
      }

      const betItemTotal = bets
        ? bets.reduce((a, b) => {
            return a + b.items.length
          }, 0)
        : 0

      const betTotal = bets
        ? bets.reduce((a, b) => {
            return a + b.amount
          }, 0)
        : 0

      const amount = items.reduce((a, b) => {
        return a + b.item_id.price
      }, 0)

      if (betTotal + amount > this.settings.maxBet)
        return Promise.reject({ code: ERROR.ExceedMaxBetAmount, message: 'EXCEED_MAX_BET_AMOUNT' })

      if (betItemTotal + items.length > this.settings.maxItemsPerPlayer)
        return Promise.reject({ code: ERROR.MaxItemsPlaced, message: 'MAX_ITEMS_PLACED' })

      if (amount < this.settings.minBet) return Promise.reject({ code: ERROR.BelowMinBet, message: 'BELOW_MIN_BET' })

      const user = await User.findById(userID).lean()
      if ([EBanLevel.Site].includes(user.banLevel))
        return Promise.reject({ code: ERROR.Banned, message: 'USER_BANNED' })

      const { n: matchedCount, nModified: modifiedCount } = await Backpack.updateMany(
        { _id: { $in: backpackIds }, user_id: userID, deleted: { $exists: false }, sold: { $exists: false } },
        { user_id: this.Config.admin.userId },
        { session }
      )

      if (modifiedCount !== backpackIds.length || matchedCount !== backpackIds.length)
        return Promise.reject({ code: ERROR.InvalidItems, message: 'INVALID_ITEMS' })

      this.currentGame.pot += amount

      if (this.currentGame.state !== EJackpotState.Waiting) {
        // antisnipe code and such.
      }

      const bet = await new Bet({
        game: this.currentGame._id,
        user: userID,
        items: items.map(item => {
          return { ...item.item_id, ...{ backpackId: item._id } }
        }),
        amount,
        gameType: EGameSelection.Silver,
      }).save()

      await new Transaction({
        to_user_id: this.Config.admin.userId,
        from_user_id: userID,
        skins: backpackIds,
        amount,
        currency: ETransactionCurrency.Skins,
        type: ETransactionType.Jackpot,
        status: ETransactionState.Confirmed,
      }).save()

      await session.commitTransaction()
      session.endSession()

      const gameUser = userDataToGameData(user)

      if (!this.players[userID.toString()]) {
        this.players[userID.toString()] = gameUser
      }

      this.bets.push(bet)

      this.bets = _.sortBy(this.bets, 'createdAt')

      if (!pendingBet)
        this.io.emit(
          'jackpot.bet',
          this.socketResponse({
            userID,
            betID: bet._id,
            steamid: user.steamID,
            username: user.username,
            avatar: user.avatar,
            level: gameUser.level,
            bet: amount,
            items: bet.items,
            rank: user.rank,
          })
        )

      const potItemTotal = this.bets.length
        ? this.bets.reduce((a, b) => {
            return a + b.items.length
          }, 0)
        : 0

      if (
        (_.size(this.players) >= 2 && this.currentGame.state === EJackpotState.Waiting) ||
        potItemTotal >= this.settings.maxItems
      )
        this.startGame(pendingBet)
      return {
        userID,
        betID: bet._id,
        steamid: user.steamID,
        username: user.username,
        avatar: user.avatar,
        level: Util.getLevel(user.wagered ? user.wagered : 0),
        rank: user.rank,
        bet: amount,
        items: bet.items,
      }
    } catch (e) {
      await session.abortTransaction()
      session.endSession()

      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'Internal Error' })
    }
  }

  private socketResponse(payload) {
    return {
      ...{ potId: 'silver' },
      ...payload,
    }
  }

  private delayGame(ms: number, partToDelay: string): void {
    this.Logger.info(`Game delayed at ${partToDelay}`)
    setTimeout(() => {
      if (partToDelay === 'start') this.startGame(false)
      if (partToDelay === 'block') this.blockBets()
      if (partToDelay === 'roll') this.rollGame()
    }, ms)
  }

  private async startGame(pendingBet): Promise<void> {
    if (pendingBet) await this.sleep(1000)
    if (_.size(this.players) < 2 || this.currentGame.state !== EJackpotState.Waiting) return

    const session = await startSession()
    session.startTransaction()

    try {
      const endTime = Date.now() + this.settings.roundTimeLimit * 1e3

      this.currentGame = await JackpotModel.findByIdAndUpdate(
        this.currentGame._id,
        { state: EJackpotState.Active, endTime, startTime: new Date(), pot: this.currentGame.pot },
        { new: true }
      )
        .session(session)
        .lean()

      await session.commitTransaction()
      session.endSession()

      this.roundTimeout = setTimeout(() => this.blockBets(), this.settings.roundTimeLimit * 1e3)

      this.io.emit('jackpot.roundStart', this.socketResponse(this.getGameData(false)))
    } catch (e) {
      await session.abortTransaction()
      session.endSession()
      this.Logger.error(e)
      this.delayGame(1000, 'start')
    }
  }

  private async blockBets(): Promise<void> {
    if (this.currentGame.state !== EJackpotState.Active && this.currentGame.state !== EJackpotState.BettingClosed)
      return
    const session = await startSession()
    session.startTransaction()

    try {
      if (this.currentGame.state === EJackpotState.Active) {
        let pot = 0
        for (let i = 0; i < this.bets.length; i++) {
          pot += this.bets[i].amount
        }
        this.currentGame.pot = pot
        this.currentGame = await JackpotModel.findByIdAndUpdate(
          this.currentGame._id,
          { state: EJackpotState.BettingClosed, pot: this.currentGame.pot },
          { new: true }
        )
          .session(session)
          .lean()
      }

      await session.commitTransaction()
      session.endSession()

      this.roundTimeout = setTimeout(() => this.rollGame(), this.settings.lastBetTime * 1e3)

      this.io.emit('jackpot.bettingClosed', this.socketResponse(this.getGameData(true)))
    } catch (e) {
      await session.abortTransaction()
      session.endSession()
      this.Logger.error(e)
      this.delayGame(1000, 'block')
    }
  }

  private async rollGame(): Promise<void> {
    if (this.currentGame.state !== EJackpotState.BettingClosed) return this.blockBets()

    const session = await startSession()
    session.startTransaction()

    try {
      this.currentGame = await JackpotModel.findById(this.currentGame._id).lean()
      const bets = await Bet.find({ game: this.currentGame._id })
        .sort({ createdAt: 1 })
        .lean()

      let pot = 0
      for (let i = 0; i < bets.length; i++) {
        pot += bets[i].amount
      }
      this.currentGame.pot = pot
      const { ticket, percentage, signature, random, randomHash } = await this.provably.getJackpotPercent(
        this.currentGame.unencodedServerHash,
        this.currentGame.pot
      )
      this.currentGame.signature = signature
      this.currentGame.randomJson = random
      this.currentGame.randomHash = randomHash
      this.currentGame.percent = percentage
      this.currentGame.roll = ticket

      let from = 0
      let to = 0

      for (let i = 0; i < bets.length; i++) {
        const bet = bets[i]
        from = to
        to += bet.amount

        if (ticket >= from && ticket <= to) {
          this.currentGame.winnerId = Types.ObjectId(bet.user)
        }
      }

      this.currentGame = await JackpotModel.findByIdAndUpdate(
        { _id: this.currentGame._id },
        { ...this.currentGame, ...{ state: EJackpotState.Rolling } },
        { new: true }
      )
        .session(session)
        .lean()

      await session.commitTransaction()
      session.endSession()

      this.io.emit('jackpot.rolling', this.socketResponse(this.getGameData(false, true)))

      setTimeout(async () => {
        this.takeRakeAndGivePrize()
      }, (this.settings.animationTime + 3) * 1e3)
    } catch (e) {
      await session.abortTransaction()
      session.endSession()
      this.Logger.error(e)
      this.delayGame(1000, 'roll')
    }
  }

  private async takeRakeAndGivePrize(): Promise<void> {
    try {
      this.currentGame = await JackpotModel.findByIdAndUpdate(
        { _id: this.currentGame._id },
        { state: EJackpotState.Completed },
        { new: true }
      ).lean()
      const bets = await Bet.find({ game: this.currentGame._id })
        .sort({ createdAt: 1 })
        .lean()
      let items = []

      bets.forEach(bet => {
        items = [...items, ...bet.items]
      })
      items = _.sortBy(items, 'price')

      const totalRake = this.currentGame.pot * this.settings.rake
      let collected = 0
      let won = 0
      const winningItems = []
      const rakedItems = []

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.price <= totalRake - collected) {
          rakedItems.push(item.backpackId)
          collected += item.price
        } else {
          winningItems.push(item.backpackId)
          won += item.price
        }
      }

      await Backpack.updateMany({ _id: { $in: winningItems } }, { user_id: this.currentGame.winnerId })
      const user = await User.findByIdAndUpdate(this.currentGame.winnerId, { $inc: { won } }, { new: true })

      const percentRaked = collected / this.currentGame.pot
      let affiliatesGiven = 0
      for (const bet of bets) {
        const userA = await User.findByIdAndUpdate(bet.user, { $inc: { wagered: bet.amount } }, { new: true })
        userA.amountBeforeWithdrawal = Math.max(userA.amountBeforeWithdrawal - bet.amount, 0)
        await userA.save()

        if (userA && userA.affiliateUsedId) {
          await this.Affiliate.addWageredAmount(userA.affiliateUsedId, bet.amount)
          if (percentRaked >= 0.05) {
            affiliatesGiven += await this.Affiliate.addBalanceFromWageredAmount(userA.affiliateUsedId, bet.amount)
          }
        }
      }

      if (rakedItems.length) {
        let eliteReward = 0
        await Backpack.updateMany({ _id: { $in: rakedItems } }, { user_id: this.Config.bot.admin, deleted: true })
        if (user.affiliateUsedId)
          eliteReward = await this.Affiliate.ifEliteGiveReward(
            collected,
            user.affiliateUsedId,
            this.currentGame.winnerId
          )
        const actualRake = collected - eliteReward - affiliatesGiven

        await new Transaction({
          from_user_id: this.currentGame._id,
          to_user_id: this.currentGame.winnerId,
          amount: won,
          currency: ETransactionCurrency.Skins,
          skins: winningItems,
          status: ETransactionState.Confirmed,
          type: ETransactionType.Winnings,
          extra: { game: 'silver' },
        }).save()

        await new Transaction({
          to_user_id: this.Config.bot.admin,
          amount: actualRake,
          currency: ETransactionCurrency.Balance,
          type: ETransactionType.Rake,
          status: ETransactionState.Confirmed,
        }).save()
        this.Discord.Notification('SILVER Rake', '', 'Jackpot', [
          {
            name: 'GameID',
            value: this.currentGame._id,
          },
          {
            name: 'Total Pot',
            value: (this.currentGame.pot / 100).toFixed(2),
          },
          {
            name: 'Max Rake',
            value: (totalRake / 100).toFixed(2),
          },
          {
            name: 'Raked Item Value',
            value: (collected / 100).toFixed(2),
          },
          {
            name: 'Affiliates Payed',
            value: (affiliatesGiven / 100).toFixed(2),
          },
          {
            name: 'Elite Reward',
            value: (eliteReward / 100).toFixed(2),
          },
          {
            name: 'Profit',
            value: (actualRake / 100).toFixed(2),
          },
        ])
      }

      this.createGame()
    } catch (e) {
      this.Logger.error(e)
      this.Discord.Notification('FAILED RAKE OF SILVER', `Failed to rake and give prize`, 'Error', [
        {
          name: 'GameID',
          value: this.currentGame._id,
        },
        {
          name: 'Location',
          value: 'silverJackpot/rakeAndGivePrize()',
        },
        {
          name: 'Ping',
          value: ['admins', 'data'],
        },
      ])
      this.createGame()
    }
  }
}
