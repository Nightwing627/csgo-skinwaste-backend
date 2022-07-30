import BaseService from './BaseService'
import { startSession } from 'mongoose'
import { ERROR } from '../constants/Errors'
import Backpack from '../models/Backpack'
import User, { EBanLevel, userDataToGameData } from '../models/User'
import Bet, { EGameSelection } from '../models/Bet'
import CoinflipModel, { ECoinflipState } from '../models/Coinflip'
import Util from '../utils'
import _ from 'lodash'
import Transaction, { ETransactionCurrency, ETransactionState, ETransactionType } from '../models/Transaction'

export enum ECoinflipSide {
  Terrorist = 't',
  CounterTerrorist = 'ct',
}

export default class Coinflip extends BaseService {
  io: any
  coinflips: any
  settings: any
  Settings: any
  Provably: any
  Affiliate: any
  Discord: any

  enabled: boolean

  constructor(io, { Settings, Provably, Affiliate, Discord }) {
    super({ location: 'services/Coinflip' })

    this.io = io
    this.Settings = Settings
    this.Provably = Provably
    this.Affiliate = Affiliate
    this.Discord = Discord

    this.settings = null

    this.enabled = false

    this.coinflips = {}

    this.Settings.on('coinflip', data => {
      this.settings = data
      this.Logger.info('COINFLIP UPDATED SETTINGS')
    })

    this.Settings.on('site', ({ enabled }) => {
      this.enabled = enabled.coinflip
      this.Logger.info(`COINFLIP Enabled=${this.enabled}`)
    })

    setInterval(() => this.interval(), 10e3)

    this._init()
  }

  private async _init() {
    try {
      this.settings = await this.Settings.getCoinflipSettings()
      const { enabled } = await this.Settings.getSiteSettings()

      this.enabled = enabled.coinflip

      const openGames = await CoinflipModel.find({ state: ECoinflipState.Waiting })
        .populate('ct')
        .populate('t')
        .lean()
      const closedGames = await CoinflipModel.find({
        state: { $nin: [ECoinflipState.Cancelled, ECoinflipState.Expired, ECoinflipState.Waiting] },
      })
        .sort({ _id: -1 })
        .limit(5)
        .populate('ct')
        .populate('t')
        .lean()

      const games = [...openGames, ...closedGames]

      for (const game of games) {
        this.coinflips[game._id.toString()] = await this.createGameObject(
          { ct: game.ct, t: game.t },
          game,
          game.state === ECoinflipState.Complete || game.state === ECoinflipState.Paid
        )

        if (game.state === ECoinflipState.Waiting && game.ct && game.t) this.runGame(game._id)
        if (game.state === ECoinflipState.Flipping && !game.winnerId) this.runGame(game._id)
        if (game.state === ECoinflipState.Complete) this.rakeAndGivePrizes(game._id)
      }
    } catch (e) {
      this.Logger.error(e)
    }
  }

  public async createGameObject({ ct = null, t = null }, game, endGame = false) {
    if (ct?.user) ct = { ...ct, ...{ user: userDataToGameData(await User.findById(ct.user).lean()) } }
    if (t?.user) t = { ...t, ...{ user: userDataToGameData(await User.findById(t.user).lean()) } }

    const obj: any = {
      gameID: game._id,
      state: game.state,
      gameHash: game.gameHash,
      endTime: game.endTime || null,
      createdBy: game.createdBy,
      ct, // Will contain bet data and user data. Same user obj as jackpot
      t, // same thing ^^^
      pot: game.pot,
      range: game.range,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
    }

    if (game.state === ECoinflipState.Flipping) obj.secondsTillRoll = game.endTime - Date.now()

    if (endGame) {
      // Data that is passed when game is going to flip or game is completed
      obj.unencodedServerHash = game.unencodedServerHash
      obj.randomHash = game.randomHash
      obj.randomJson = game.randomJson
      obj.signature = game.signature
      obj.roll = game.roll
      obj.percent = game.percent
      obj.winnerId = game.winnerId
    }

    return obj
  }

  public async interval() {
    try {
      const finishedGames = []
      const coinflips = _.sortBy(this.coinflips, 'state')
      for (const coinflip of coinflips) {
        if (coinflip.state === ECoinflipState.Paid) finishedGames.push(coinflip)
      }

      if (finishedGames.length > 5) {
        const clearGames = _.sortBy(finishedGames, 'updatedAt').slice(0, finishedGames.length - 5)
        for (const game of clearGames) {
          delete this.coinflips[game.gameID]
          this.io.emit('coinflip.remove', game.gameID)
        }
      }
    } catch (e) {
      this.Logger.error(e)
    }
  }

  public async cancelGame(userId, gameId) {
    const session = await startSession()
    session.startTransaction()
    try {
      const game = await CoinflipModel.findOneAndUpdate(
        { _id: gameId, createdBy: userId, state: ECoinflipState.Waiting },
        { state: ECoinflipState.Cancelled },
        { session, new: true }
      ).lean()
      if (!game) return Promise.reject({ code: ERROR.GameNotFound, message: 'GAME_NOT_FOUND' })
      const bets = await Bet.find({ game: game._id }).lean()

      let items = []

      bets.forEach(bet => {
        items = [...items, ...bet.items]
      })

      items = items.map(item => item.backpackId)

      const { n: matchedCount, nModified: modifiedCount } = await Backpack.updateMany(
        { _id: { $in: items } },
        { user_id: userId },
        { session }
      )

      if (modifiedCount !== items.length || matchedCount !== items.length) {
        this.Discord.Notification(
          'Error Returning Items on CF Cancel',
          'Failed when giving item back to user',
          'Error',
          [
            {
              name: 'UserID',
              value: userId,
            },
            {
              name: 'ItemIDs',
              value: items.join(','),
            },
            {
              name: 'Location',
              value: 'coinflip/cancelGame()',
            },
            {
              name: 'Ping',
              value: ['admins', 'data'],
            },
          ]
        )
        return Promise.reject({ code: ERROR.InvalidItems, message: 'INVALID_ITEMS' })
      }

      await session.commitTransaction()
      session.endSession()

      delete this.coinflips[gameId]
      this.io.emit('coinflip.remove', gameId)
    } catch (e) {
      await session.abortTransaction()
      session.endSession()
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async getGame(gameId) {
    try {
      const coinflip = await CoinflipModel.findOne({ _id: gameId })
        .populate('ct')
        .populate('t')
        .lean()

      return this.createGameObject(
        { ct: coinflip.ct, t: coinflip.t },
        coinflip,
        coinflip.state === ECoinflipState.Complete || coinflip.state === ECoinflipState.Paid
      )
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async getHistory() {
    try {
      const coinflips = await CoinflipModel.find({ state: { $in: [ECoinflipState.Paid, ECoinflipState.Complete] } })
        .limit(30)
        .sort({ _id: -1 })
        .lean()

      for (let i = 0; i < coinflips.length; i++) {
        coinflips[i].winner = await User.findById(coinflips[i].winnerId)
      }
      return coinflips
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async get() {
    try {
      for (const key in this.coinflips) {
        if (this.coinflips.hasOwnProperty(key)) {
          const coinflip = this.coinflips[key]
          if (coinflip.state === ECoinflipState.Flipping) {
            this.coinflips[key] = { ...coinflip, ...{ secondsTillRoll: coinflip.endTime - Date.now() } }
          }
        }
      }

      return this.coinflips
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async createGame(userID, backpackIds, side: ECoinflipSide) {
    if (this.isRace(userID.toString(), 2000)) return Promise.reject({ code: ERROR.TooFast, message: 'TOO_FAST' })
    if (!this.enabled) return Promise.reject({ code: ERROR.AdminLock, message: 'ADMIN_LOCKED' })

    const session = await startSession()
    session.startTransaction()
    try {
      const user = await User.findById(userID)
        .select('banLevel')
        .lean()

      if ([EBanLevel.Site].includes(user.banLevel))
        return Promise.reject({ code: ERROR.Banned, message: 'USER_BANNED' })

      const gameCount = await CoinflipModel.countDocuments({ createdBy: userID, state: ECoinflipState.Waiting })
      if (gameCount >= this.settings.maxOpenGamesPerPlayer)
        return Promise.reject({ code: ERROR.MaxGamesCreated, message: 'MAX_GAMES_CREATED' })
      const items = await Backpack.find({
        _id: { $in: backpackIds },
        user_id: userID,
        deleted: { $exists: false },
        sold: { $exists: false },
      })
        .populate('item_id')
        .lean()

      const amount = items.reduce((a, b) => {
        return a + b.item_id.price
      }, 0)

      if (items.length !== backpackIds.length || !items.length)
        return Promise.reject({ code: ERROR.InvalidItems, message: 'INVALID_ITEMS' })

      if (items.length > this.settings.maxItemsPerPlayer)
        return Promise.reject({ code: ERROR.MaxItemsPlaced, message: 'MAX_ITEMS_EXCEEDED' })

      if (amount < this.settings.minBet) return Promise.reject({ code: ERROR.BelowMinBet, message: 'BELOW_MIN_BET' })

      const { n: matchedCount, nModified: modifiedCount } = await Backpack.updateMany(
        { _id: { $in: backpackIds }, user_id: userID, deleted: { $exists: false }, sold: { $exists: false } },
        { user_id: this.Config.admin.userId },
        { session }
      )

      if (modifiedCount !== backpackIds.length || matchedCount !== backpackIds.length)
        return Promise.reject({ code: ERROR.InvalidItems, message: 'INVALID_ITEMS' })

      const serverSeed = this.Provably.generateServerSeed()

      const high = (amount * 1.1).toFixed(0)
      const low = (amount - amount * 0.1).toFixed(0)

      const game = new CoinflipModel({
        unencodedServerHash: serverSeed,
        gameHash: Util.genGameHash(serverSeed),
        createdBy: userID,
        range: {
          high,
          low,
        },
      })

      const bet = await new Bet({
        game: game._id,
        user: userID,
        items: items.map(item => {
          return { ...item.item_id, ...{ backpackId: item._id } }
        }),
        amount,
        gameType: EGameSelection.Coinflip,
        extra: { side },
      }).save()

      game[side] = bet._id
      game.pot = amount
      await game.save()

      this.coinflips[game._id.toString()] = await this.createGameObject({ [side]: bet.toObject() }, game)

      this.io.emit('coinflip.newGame', this.coinflips[game._id.toString()])

      await session.commitTransaction()
      session.endSession()

      return this.coinflips[game._id.toString()]
    } catch (e) {
      await session.abortTransaction()
      session.endSession()
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async joinGame(gameId, userId, backpackIds) {
    if (this.isRace(userId.toString(), 2000)) return Promise.reject({ code: ERROR.TooFast, message: 'TOO_FAST' })
    if (!this.enabled) return Promise.reject({ code: ERROR.AdminLock, message: 'ADMIN_LOCKED' })

    const session = await startSession()
    session.startTransaction()
    try {
      const user = await User.findById(userId)
        .select('banLevel')
        .lean()

      if ([EBanLevel.Site].includes(user.banLevel))
        return Promise.reject({ code: ERROR.Banned, message: 'USER_BANNED' })

      const game = await CoinflipModel.findOne({ _id: gameId, state: ECoinflipState.Waiting })
        .populate('ct')
        .populate('t')

      if (!game) return Promise.reject({ code: ERROR.GameNotFound, message: 'GAME_NOT_FOUND' })

      if (game.createdBy.toString() === userId.toString())
        return Promise.reject({ code: ERROR.InvalidGame, message: 'INVALID_GAME' })

      const items = await Backpack.find({
        _id: { $in: backpackIds },
        user_id: userId,
        deleted: { $exists: false },
        sold: { $exists: false },
      })
        .populate('item_id')
        .lean()

      const amount = items.reduce((a, b) => {
        return a + b.item_id.price
      }, 0)

      if (items.length !== backpackIds.length || !items.length)
        return Promise.reject({ code: ERROR.InvalidItems, message: 'INVALID_ITEMS' })

      if (items.length > this.settings.maxItemsPerPlayer)
        return Promise.reject({ code: ERROR.MaxItemsPlaced, message: 'MAX_ITEMS_EXCEEDED' })

      if (amount < this.settings.minBet) return Promise.reject({ code: ERROR.BelowMinBet, message: 'BELOW_MIN_BET' })

      if (amount < game.range.low || amount > game.range.high)
        return Promise.reject({ code: ERROR.OutsideOfRange, message: 'OUTSIDE_OF_RANGE' })

      const { n: matchedCount, nModified: modifiedCount } = await Backpack.updateMany(
        { _id: { $in: backpackIds }, user_id: userId, deleted: { $exists: false }, sold: { $exists: false } },
        { user_id: this.Config.admin.userId },
        { session }
      )

      if (modifiedCount !== backpackIds.length || matchedCount !== backpackIds.length)
        return Promise.reject({ code: ERROR.InvalidItems, message: 'INVALID_ITEMS' })

      const side = !game.ct ? ECoinflipSide.CounterTerrorist : ECoinflipSide.Terrorist

      const bet = await new Bet({
        game: game._id,
        user: userId,
        items: items.map(item => {
          return { ...item.item_id, ...{ backpackId: item._id } }
        }),
        amount,
        gameType: EGameSelection.Coinflip,
        extra: { side },
      }).save()

      const otherSide = side === ECoinflipSide.Terrorist ? ECoinflipSide.CounterTerrorist : ECoinflipSide.Terrorist

      const otherBet = game[otherSide].toObject()

      game[side] = bet._id
      game.pot += amount
      game.state = ECoinflipState.Flipping
      game.endTime = Date.now() + this.settings.roundTimeLimit * 1e3
      game.startTime = new Date()
      await game.save({ session })

      await session.commitTransaction()
      session.endSession()

      this.coinflips[game._id.toString()] = await this.createGameObject(
        { [side]: bet.toObject(), [otherSide]: otherBet },
        game
      )

      this.io.emit('coinflip.joinGame', this.coinflips[game._id.toString()])

      setTimeout(() => this.runGame(game._id), 10e3)

      return this.coinflips[game._id.toString()]
    } catch (e) {
      await session.abortTransaction()
      session.endSession()
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  private async runGame(gameId) {
    const session = await startSession()
    session.startTransaction()
    try {
      const game = await CoinflipModel.findOne({ _id: gameId, state: ECoinflipState.Flipping })
        .populate('ct')
        .populate('t')
      if (!game) return Promise.reject({ code: ERROR.GameNotFound, message: 'GAME_NOT_FOUND' })

      const { ticket, percentage, signature, random, randomHash } = await this.Provably.getJackpotPercent(
        game.unencodedServerHash,
        game.pot
      )

      game.signature = signature
      game.randomJson = random
      game.randomHash = randomHash
      game.percent = percentage
      game.roll = ticket

      if (ticket <= game.t.amount) game.winnerId = game.t.user
      else game.winnerId = game.ct.user

      game.state = ECoinflipState.Complete
      await game.save({ session })

      await session.commitTransaction()
      session.endSession()

      this.coinflips[game._id.toString()] = await this.createGameObject(
        { ct: game.ct.toObject(), t: game.t.toObject() },
        game,
        true
      )
      this.io.emit('coinflip.flip', this.coinflips[game._id.toString()])
      this.rakeAndGivePrizes(game._id)
    } catch (e) {
      this.Logger.error(e)
      await session.abortTransaction()
      session.endSession()
      this.Discord.Notification('Failed CF Start', '', 'Error', [
        {
          name: 'GameID',
          value: gameId,
        },
        {
          name: 'Location',
          value: 'coinflip/runGame()',
        },
        {
          name: 'Ping',
          value: ['admins'],
        },
      ])
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  private async rakeAndGivePrizes(gameId) {
    const session = await startSession()
    session.startTransaction()
    try {
      const game = await CoinflipModel.findByIdAndUpdate(gameId, { state: ECoinflipState.Paid }, { session, new: true })
        .populate('ct')
        .populate('t')
        .lean()

      this.coinflips[game._id.toString()] = await this.createGameObject({ ct: game.ct, t: game.t }, game, true)

      const bets = await Bet.find({ game: game._id }).lean()

      let items = []

      bets.forEach(bet => {
        items = [...items, ...bet.items]
      })
      items = _.sortBy(items, 'price')

      const totalRake = game.pot * this.settings.rake
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

      await Backpack.updateMany({ _id: { $in: winningItems } }, { user_id: game.winnerId }, { session })
      const user = await User.findByIdAndUpdate(game.winnerId, { $inc: { won } }, { session })

      const percentRaked = collected / game.pot
      let affiliatesGiven = 0
      for (const bet of bets) {
        const userA = await User.findByIdAndUpdate(bet.user, { $inc: { wagered: bet.amount } }, { new: true, session })
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
        await Backpack.updateMany({ _id: { $in: rakedItems } }, { user_id: this.Config.admin.userId, deleted: true })
        if (user.affiliateUsedId)
          eliteReward = await this.Affiliate.ifEliteGiveReward(collected, user.affiliateUsedId, game.winnerId)
        const actualRake = collected - eliteReward - affiliatesGiven

        await new Transaction({
          from_user_id: game._id,
          to_user_id: game.winnerId,
          amount: won,
          currency: ETransactionCurrency.Skins,
          skins: winningItems,
          status: ETransactionState.Confirmed,
          type: ETransactionType.Winnings,
          extra: { game: 'coinflip' },
        }).save()

        await new Transaction({
          to_user_id: this.Config.admin.userId,
          amount: actualRake,
          currency: ETransactionCurrency.Balance,
          type: ETransactionType.Rake,
          status: ETransactionState.Confirmed,
        }).save()
        this.Discord.Notification('CF Rake', '', 'Coinflip', [
          {
            name: 'GameID',
            value: gameId,
          },
          {
            name: 'Total Pot',
            value: (game.pot / 100).toFixed(2),
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

      await session.commitTransaction()
      session.endSession()
    } catch (e) {
      this.Logger.error(e)
      this.Discord.Notification('FAILED RAKE OF CF', `Failed to rake and give prize`, 'Error', [
        {
          name: 'GameID',
          value: gameId,
        },
        {
          name: 'Location',
          value: 'coinflip/rakeAndGivePrize()',
        },
        {
          name: 'Ping',
          value: ['admins', 'data'],
        },
      ])
      await session.abortTransaction()
      session.endSession()
    }
  }
}
