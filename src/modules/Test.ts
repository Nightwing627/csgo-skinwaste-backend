import Chance from 'chance'
import config from 'config'

import BaseService from './BaseService'
import ICoinflip, { ECoinflipSide } from './Coinflip'
import IRoulette, { ERouletteSides } from './Roulette'
import IJackpot from './Jackpot'
import ISilverJackpot from './SilverJackpot'

import CoinflipM from '../models/Coinflip'
import Item from '../models/Item'
import Backpack from '../models/Backpack'
import User from '../models/User'
import { ObjectID } from 'mongodb'

export default class Test extends BaseService {
  Jackpot: IJackpot
  SilverJackpot: ISilverJackpot
  Coinflip: ICoinflip
  Roulette: IRoulette

  constructor({ Jackpot, SilverJackpot, Coinflip, Roulette }) {
    super({ location: 'module/Test' })

    this.Jackpot = Jackpot
    this.SilverJackpot = SilverJackpot
    this.Coinflip = Coinflip
    this.Roulette = Roulette
  }

  public async createTestItemsForAccount(userId, itemIds) {
    try {
      const backpack = []
      for (let i = 0; i < itemIds.length; i++) {
        const itemId = itemIds[i]
        const backpackItem = await new Backpack({
          user_id: userId,
          item_id: itemId,
        }).save()

        backpack.push(backpackItem)
      }

      return backpack
    } catch (e) {
      this.Logger.error(e)
      Promise.reject({ code: this.Error.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async giveRandomItems(userId, amount: number): Promise<void> {
    try {
      const items = await Item.aggregate([
        {
          $match: {
            price: { $gte: 100, $lte: 50000 },
          },
        },
        {
          $sample: {
            size: amount,
          },
        },
      ])

      await this.createTestItemsForAccount(
        userId,
        items.map(item => item._id)
      )
    } catch (err) {
      this.Logger.error(err)
      return Promise.reject({ code: this.Error.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async placeJackpotTestBet(userID, game) {
    const pot = game === 'elite' ? this.Jackpot.currentGame.pot : this.SilverJackpot.currentGame.pot

    this.Logger.info(pot)

    try {
      const item =
        pot === 0
          ? await Item.findOne({})
          : await Item.findOne({
              price: {
                $gte: parseInt((pot * 0.9).toFixed(2), 10),
                $lte: parseInt((pot * 1.1).toFixed(2), 10),
              },
              active: true,
            }).lean()

      this.Logger.debug(item)
      const backpackIds = await (await this.createTestItemsForAccount(userID, [item._id])).map(backpack => {
        return backpack._id
      })
      return game === 'elite'
        ? await this.Jackpot.placeBet(userID, backpackIds)
        : await this.SilverJackpot.placeBet(userID, backpackIds)
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject(e)
    }
  }

  public async botCreateCoinflip() {
    try {
      const items = await (
        await Item.find({ price: { $gte: 100, $lte: 2000 }, active: true })
          .limit(5)
          .lean()
      ).map(item => item._id)
      const backpackIds = await (await this.createTestItemsForAccount(config.testing.testAccountID, items)).map(
        backpack => backpack._id
      )

      const side = [ECoinflipSide.Terrorist, ECoinflipSide.CounterTerrorist]

      return await this.Coinflip.createGame(
        config.testing.testAccountID,
        backpackIds,
        side[new Chance().integer({ min: 0, max: 1 })]
      )
    } catch (e) {
      return Promise.reject(e)
    }
  }

  public async botJoinCoinflip(gameId) {
    try {
      const coinflip = await CoinflipM.findById(gameId).lean()
      const item = await Item.findOne({
        price: { $gte: coinflip.range.low, $lte: coinflip.range.high },
        active: true,
      }).lean()
      const backpackIds = await (await this.createTestItemsForAccount(config.testing.testAccountID, [item._id])).map(
        backpack => {
          return backpack._id
        }
      )
      return await this.Coinflip.joinGame(gameId, config.testing.testAccountID, backpackIds)
    } catch (e) {
      return Promise.reject(e)
    }
  }

  public async placeRouletteBet(betType) {
    try {
      if (!betType) {
        await User.findByIdAndUpdate(config.testing.testAccountID, { $inc: { balance: 100 } })
        return await this.Roulette.placeBet(new ObjectID(config.testing.testAccountID), ERouletteSides.Black, 100)
      }

      let users = []

      switch (betType) {
        case 'all':
          await User.findByIdAndUpdate(config.testing.testAccountID, { $inc: { balance: 600 } })
          await this.Roulette.placeBet(new ObjectID(config.testing.testAccountID), ERouletteSides.Black, 100)
          await this.Roulette.placeBet(new ObjectID(config.testing.testAccountID), ERouletteSides.Gold, 100)
          await this.Roulette.placeBet(new ObjectID(config.testing.testAccountID), ERouletteSides.Pink, 100)
          return true
        case 'big-bet':
          await User.findByIdAndUpdate(config.testing.testAccountID, { $inc: { balance: 10000 } })
          return await this.Roulette.placeBet(new ObjectID(config.testing.testAccountID), ERouletteSides.Gold, 10000)
        case 'all-users':
          users = await User.aggregate([{ $sample: { size: new Chance().integer({ min: 1, max: 100 }) } }])
          // eslint-disable-next-line no-case-declarations
          const sides = [ERouletteSides.Black, ERouletteSides.Pink, ERouletteSides.Gold]
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          users.forEach((user, _index) => {
            setTimeout(() => {
              const betAmount = new Chance().integer({ min: 100, max: 1000 })
              User.updateOne({ _id: user._id }, { balance: betAmount }).then(() =>
                this.Roulette.placeBet(user._id, sides[new Chance().integer({ min: 0, max: 2 })], betAmount)
              )
            }, new Chance().integer({ min: 1, max: 15 }) * 1000)
          })
          return true

        default:
          await User.findByIdAndUpdate(config.testing.testAccountID, { $inc: { balance: 100 } })
          return await this.Roulette.placeBet(new ObjectID(config.testing.testAccountID), ERouletteSides.Gold, 100)
      }
    } catch (e) {
      this.Logger.error(e)
      Promise.reject({ code: this.Error.InternalError, message: 'INTERNAL_ERROR' })
    }
  }
}
