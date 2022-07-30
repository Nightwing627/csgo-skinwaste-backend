import BaseService from './BaseService'
import User, { IUser, EBanLevel, userDataToGameData } from '../models/User'
import Bet, { IBets, EGameSelection } from '../models/Bet'
import RouletteM, { IRoulette, ERouletteState } from '../models/Roulette'
import IProvably from './Provably'
import ISettings from './Settings'
import IDiscord from './Discord'
import IAffiliates from './Affiliates'
import { ObjectID } from 'mongodb'
import { ERROR } from '../constants/Errors'
import { startSession } from 'mongoose'
import Transaction, { ETransactionCurrency, ETransactionType, ETransactionState } from '../models/Transaction'

export interface IRouletteSettings {
  maxBet: number
  minBet: number
  roundTimeLimit: number
  animationTime: number
  lastBetTime: number
  maxBetsPerRound: number
}

export enum ERouletteSides {
  Black = 'black',
  Purple = 'purple',
  Pink = 'pink',
  Gold = 'gold',
}

interface IRouletteBet {
  userid: string
  amount: number
  field: string
  username: string
  avatar: string
}

export default class Roulette extends BaseService {
  players: {
    [key: string]: IUser
  }
  bets: IRouletteBet[]
  history: IRoulette[] = []
  settings: IRouletteSettings
  currentGame: IRoulette | null
  enabled: boolean

  pendingBets: any

  io: any
  Provably: IProvably
  Affiliate: IAffiliates
  Settings: ISettings
  Discord: IDiscord

  constructor(io, { Provably, Affiliate, Settings, Discord }) {
    super({ location: 'service/Roulette' })

    this.players = {}
    this.bets = []
    this.settings = null

    this.io = io
    this.Provably = Provably
    this.Affiliate = Affiliate
    this.Settings = Settings
    this.Discord = Discord

    this.enabled = false
    this.currentGame = null

    this.pendingBets = []

    this.Settings.on('roulette', data => {
      this.settings = data
      this.io.emit('config.roulette', this.settings)
    })

    this.Settings.on('site', ({ enabled }) => {
      this.enabled = enabled.roulette
    })

    this._init()
  }

  async _init() {
    try {
      this.settings = await this.Settings.getRouletteConfig() // TODO: update when config done.
      const { enabled } = await this.Settings.getSiteSettings()
      this.enabled = enabled.roulette

      this.history = await RouletteM.find({ state: ERouletteState.Completed })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean()
      this.currentGame = await RouletteM.findOne({ state: { $ne: ERouletteState.Completed } }).lean()
      if (!this.currentGame) await this.createGame()

      await this.retrievePlayersAndBets()

      if (this.currentGame.state === ERouletteState.Rolling) return this.givePrizes()
      if (this.currentGame.state === ERouletteState.BettingClosed) return this.rollGame()
      if (this.currentGame.state === ERouletteState.Active) {
        if (this.currentGame.endTime < Date.now()) return this.blockBets()
        setTimeout(() => this.blockBets(), this.currentGame.endTime - Date.now())
      }
    } catch (e) {
      this.Logger.error(e)
    }
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

        this.bets.push({
          userid: bet.user,
          field: bet.extra.field,
          amount: bet.amount,
          username: user.username,
          avatar: user.avatar,
        })
      })
    } catch (e) {
      this.Logger.error(e)
    }
  }

  async getGameData(justGame: boolean, endGame = false) {
    const gameData = this.currentGame

    if (gameData.state === ERouletteState.Active || gameData.state === ERouletteState.BettingClosed)
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
      return { ...gameData, ...{ history: this.history } }
    }

    return { ...gameData, ...{ players: this.players }, ...{ bets: this.bets }, ...{ history: this.history } }
  }

  async createGame() {
    try {
      this.Logger.info('CREATE GAME')
      const serverSeed = this.Provably.generateServerSeed()
      const endTime = Date.now() + this.settings.roundTimeLimit * 1e3
      this.currentGame = (
        await new RouletteM({
          unencodedServerHash: serverSeed,
          gameHash: this.Util.genGameHash(serverSeed),
          endTime,
          startTime: Date.now(),
        }).save()
      ).toObject()

      this.history = await RouletteM.find({ state: ERouletteState.Completed })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean()

      setTimeout(() => this.blockBets(), this.settings.roundTimeLimit * 1e3)

      this.players = {}
      this.bets = []
      this.currentGame.pot = 0
      // if (this.pendingBets.length)
      //   for (const bet of this.pendingBets) {
      //     try {
      //       this.Logger.info(bet)
      //       await this.placeBet(bet.userID, bet.field, bet.amount, true)
      //     } catch (e) {
      //       this.Logger.error(e)
      //     }
      //   }

      // this.pendingBets = []
      this.io.emit('roulette.new', await this.getGameData(false, false))
    } catch (e) {
      this.Logger.error(e)
    }
  }

  async blockBets() {
    // this.Logger.info('BLOCK BETS', this.currentGame)
    try {
      if (this.currentGame.state === ERouletteState.Active) {
        const pot = this.bets.reduce((a, b) => a + b.amount, 0)
        this.currentGame.pot = pot
        this.currentGame = await RouletteM.findByIdAndUpdate(
          this.currentGame._id,
          { state: ERouletteState.BettingClosed, pot: this.currentGame.pot },
          { new: true }
        ).lean()

        setTimeout(() => this.rollGame(), this.settings.lastBetTime * 1e3)
        this.io.emit('roulette.lock', await this.getGameData(true))
      }
    } catch (e) {
      this.Logger.error(e)
      this.Logger.info('Retrying Bet Lock')
      setTimeout(() => this.blockBets, 1e3)
    }
  }

  async rollGame() {
    this.Logger.info('ROLL GAME')
    if (this.currentGame.state !== ERouletteState.BettingClosed) return this.blockBets()

    const session = await startSession()
    session.startTransaction()

    try {
      this.currentGame = await RouletteM.findById(this.currentGame._id).lean()

      const bets = await Bet.find({ game: this.currentGame._id }).lean()

      this.currentGame.pot = bets.reduce((a, b) => a + b.amount, 0)

      const { roll, signature, random, randomHash } = await this.Provably.getRouletteWinningField(
        this.currentGame.unencodedServerHash
      )
      this.currentGame.signature = signature
      this.currentGame.randomJson = random
      this.currentGame.randomHash = randomHash
      this.currentGame.roll = roll

      this.currentGame = await RouletteM.findByIdAndUpdate(
        this.currentGame._id,
        { ...this.currentGame, ...{ state: ERouletteState.Rolling } },
        { session, new: true }
      ).lean()
      await session.commitTransaction()
      session.endSession()

      this.io.emit('roulette.roll', await this.getGameData(false, true))

      setTimeout(() => this.givePrizes(), this.settings.animationTime * 1e3)
    } catch (e) {
      await session.abortTransaction()
      session.endSession()
      this.Logger.error(e)
      setTimeout(() => this.rollGame(), 1e3)
    }
  }

  public async givePrizes() {
    // this.Logger.info('PAYOUT', this.currentGame)
    try {
      this.currentGame = await RouletteM.findByIdAndUpdate(
        this.currentGame._id,
        { state: ERouletteState.Completed },
        { new: true }
      ).lean()

      const multiplier = {
        black: 2,
        purple: 3,
        pink: 5,
        gold: 30,
      }

      const bets = await Bet.find({ game: this.currentGame._id, 'extra.field': this.currentGame.roll }).lean()
      const lostBets = await Bet.find({
        game: this.currentGame._id,
        'extra.field': { $ne: this.currentGame.roll },
      }).lean()

      const won = bets.reduce((a, b) => a + b.amount, 0)
      const rakedTotal = lostBets.reduce((a, b) => a + b.amount, 0) - won * multiplier[this.currentGame.roll]
      let affiliatesGiven = 0

      const percentRaked = rakedTotal / this.currentGame.pot

      for (const bet of bets) {
        try {
          const winAmount = bet.amount * multiplier[this.currentGame.roll]
          const user = await User.findByIdAndUpdate(
            bet.user,
            { $inc: { balance: winAmount, won: winAmount, wagered: bet.amount } },
            { new: true }
          )
          user.amountBeforeWithdrawal = Math.max(user.amountBeforeWithdrawal - bet.amount, 0)
          await user.save()

          this.Logger.info(user.balance)

          if (user && user.affiliateUsedId) {
            await this.Affiliate.addWageredAmount(user.affiliateUsedId, bet.amount)
            if (percentRaked >= 0.05) {
              affiliatesGiven += await this.Affiliate.addBalanceFromWageredAmount(user.affiliateUsedId, bet.amount)
            }
          }

          await new Transaction({
            from_user_id: this.currentGame._id,
            to_user_id: user._id,
            amount: winAmount,
            currency: ETransactionCurrency.Balance,
            status: ETransactionState.Confirmed,
            type: ETransactionType.Winnings,
          }).save()
        } catch (e) {
          this.Logger.error(e)
          this.Discord.Notification('FAILED ROULETTE PAYOUT TO USER', '', 'Error', [
            {
              name: 'GameID',
              value: this.currentGame._id,
            },
            {
              name: 'Location',
              value: 'roulette/givePrize()',
            },
            {
              name: 'UserId',
              value: bet.user,
            },
            {
              name: 'Amount',
              value: `$${(bet.amount / 100).toFixed(2)}`,
            },
            {
              name: 'Error Message',
              value: e.message,
            },
            {
              name: 'Ping',
              value: ['admins', 'data'],
            },
          ])
        }
      }

      const actualRake = rakedTotal - affiliatesGiven
      await new Transaction({
        to_user_id: this.Config.admin.userId,
        from_user_id: this.currentGame._id,
        amount: actualRake,
        currency: ETransactionCurrency.Balance,
        type: ETransactionType.Rake,
        status: ETransactionState.Confirmed,
      }).save()
      if (this.currentGame.pot > 0) {
        this.Discord.Notification('ROULETTE Rake', '', 'Roulette', [
          {
            name: 'GameID',
            value: this.currentGame._id,
          },
          {
            name: 'Roll',
            value: this.currentGame.roll.toUpperCase(),
          },
          {
            name: 'Total Pot',
            value: (this.currentGame.pot / 100).toFixed(2),
          },
          { name: 'Total Winnings Bets', value: `$${(won / 100).toFixed(2)}` },
          {
            name: 'Total Losing Bets',
            value: `$${(lostBets.reduce((a, b) => a + b.amount, 0) / 100).toFixed(2)}`,
          },
          {
            name: 'Total Paid Out',
            value: `$${((won * multiplier[this.currentGame.roll]) / 100).toFixed(2)}`,
          },
          {
            name: 'Affiliates Paid',
            value: `$${(affiliatesGiven / 100).toFixed(2)}`,
          },
          {
            name: 'Profit',
            value: (actualRake / 100).toFixed(2),
          },
        ])
      }

      this.createGame()
    } catch (e) {
      this.Discord.Notification('FAILED ROULETTE PAYOUT', '', 'Error', [
        {
          name: 'GameID',
          value: this.currentGame._id,
        },
        {
          name: 'Location',
          value: 'roulette/givePrize()',
        },
        {
          name: 'Error Message',
          value: e.message,
        },
        {
          name: 'Ping',
          value: ['admins', 'data'],
        },
      ])
      this.Logger.error(e)
      this.createGame()
    }
  }

  async placeBet(userID: ObjectID, field: ERouletteSides, amount: number, pendingBet = false) {
    if (this.isRace(userID.toString(), 1000) && !pendingBet)
      return Promise.reject({ code: ERROR.TooFast, message: 'TOO_FAST' })
    if (!this.enabled) return Promise.reject({ code: ERROR.AdminLock, message: 'ADMIN_LOCKED' })
    const session = await startSession()
    try {
      const result = await this.withTransaction(session, async () => {
        if (amount < this.settings.minBet)
          return Promise.reject({ code: ERROR.BelowMinBet, message: `VALUE_BELOW_MIN_BET_OF_${this.settings.minBet}` })

        if (this.currentGame.state !== ERouletteState.Active) {
          // this.pendingBets.push({ userID, field, amount })
          return Promise.reject({ code: ERROR.GameInProgress, message: 'GAME_IN_PROGRESS' })
        }

        const user = await User.findByIdAndUpdate(userID, { $inc: { balance: -amount } }, { session, new: true })
        if (!user) return Promise.reject({ code: ERROR.UserNotFound, message: 'USER_NOT_FOUND' })
        if (user.balance < 0) return Promise.reject({ code: ERROR.InsufficientFunds, message: 'INSUFFICIENT_FUNDS' })

        const bets = await Bet.find({ user: userID, game: this.currentGame._id })

        if (bets.length >= this.settings.maxBetsPerRound) {
          return Promise.reject({ code: ERROR.MaxBetPerRound, message: 'MAX_BET_PER_ROUND' })
        }

        const betTotal = bets.reduce((a, b) => a + b.amount, 0)

        if (amount > this.settings.maxBet || betTotal + amount > this.settings.maxBet)
          return Promise.reject({ code: ERROR.ExceedMaxBetAmount, message: 'VALUE_ABOVE_MAX_BET' })

        if (EBanLevel.Site === user.banLevel) return Promise.reject({ code: ERROR.Banned, message: 'USER_BANNED' })

        this.currentGame.pot += amount

        await new Bet({
          game: this.currentGame._id,
          user: userID,
          amount,
          gameType: EGameSelection.Roulette,
          extra: {
            field,
          },
          session,
        }).save()

        await new Transaction({
          to_user_id: this.currentGame._id,
          from_user_id: userID,
          amount,
          currency: ETransactionCurrency.Balance,
          type: ETransactionType.Roulette,
          status: ETransactionState.Confirmed,
          session,
        }).save()

        const gameUser = userDataToGameData(user.toObject())

        if (!this.players[userID.toString()]) {
          this.players[userID.toString()] = gameUser
        }

        this.bets.push({ userid: userID.toString(), amount, field, username: user.username, avatar: user.avatar })

        if (!pendingBet) {
          this.io.emit('roulette.bet', { user: gameUser, amount, field, username: user.username, avatar: user.avatar })
        }

        await session.commitTransaction()
        return { user: gameUser, amount, field }
      })

      const { error } = result
      if (error) {
        const { code, message } = result
        this.Logger.error(error)
        return Promise.reject({ code, message })
      }
      return result
    } catch (e) {
      await session.abortTransaction()
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'Internal Error' })
    } finally {
      await session.endSession()
    }
  }

  public async withTransaction(session, closure) {
    let result

    try {
      await session.withTransaction(async () => {
        result = await closure()
      })
      return result
    } catch (e) {
      return { error: true, ...e }
    }
  }

  public async getGameDataByID(gameID) {
    try {
      const game = await RouletteM.find({ _id: gameID, state: ERouletteState.Completed })
      if (!game) return Promise.reject({ code: ERROR.GameNotFound, message: 'GAME_NOT_FOUND' })
      return game
    } catch (e) {
      return Promise.reject({ code: ERROR.InternalError, message: 'Internal Error' })
    }
  }
}
