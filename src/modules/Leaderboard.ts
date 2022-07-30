import moment from 'moment'
import { startSession } from 'mongoose'
import BetDB from '../models/Bet'
import LeaderboardDB, { ILeaderboardUser } from '../models/Leaderboard'
import Transaction, { ETransactionCurrency, ETransactionState, ETransactionType } from '../models/Transaction'
import UserDB from '../models/User'
import BaseService from './BaseService'
import Schedule from 'node-schedule'
export default class Leaderboard extends BaseService {
  Settings: any
  settings: any

  constructor({ Settings }) {
    super({ location: 'service/leaderboard' })
    this.Logger.info('Leaderboard service initialized')
    this.startRecurringTasks()
    this.Settings = Settings

    this._init()
  }

  private async _init() {
    try {
      this.settings = await this.Settings.getLeaderboardSettings()
    } catch (err) {
      // console.log(err)
    }
  }

  private async startRecurringTasks() {
    // ever 1 minute
    Schedule.scheduleJob('*/1 * * * *', async () => {
      // this.Logger.info('Updating Leaderboards')
      await this.refreshLeaderboard()
      await this.refreshLeaderboard(true)
    })
    // every Sunday midnight
    Schedule.scheduleJob('0 0 * * 0', async () => {
      // this.Logger.info('Reward Weekly')
      this.safeAndRewardLeaderboard(true)
    })
    // every first day of the month
    Schedule.scheduleJob('0 0 1 * *', async () => {
      // this.Logger.info('Reward Monthly')
      this.safeAndRewardLeaderboard(true)
    })
  }

  public async getLeaderboard(isWeekly: boolean): Promise<any> {
    try {
      // get leaderboard data from db
      let filter = {}
      if (isWeekly) {
        // custom string for weekly or monthly
        filter = { week: `${this.leadingZero(moment().isoWeek())}-${moment().year()}` }
      } else {
        filter = { month: `${this.leadingZero(moment().month() + 1)}-${moment().year()}` }
      }
      const _leaderboard = await LeaderboardDB.findOne(filter)
      if (!_leaderboard) throw new Error('Leaderboard data is null')

      return { leaderboardUsers: _leaderboard.users }
    } catch (err) {
      this.Logger.error(err)
      return { error: err }
    }
  }

  public async refreshLeaderboard(isWeekly = false): Promise<any> {
    try {
      // get all bets from this month
      const today = moment().endOf('day')
      const startOfMonth = isWeekly ? moment().startOf('week') : moment().startOf('month')
      const allBets = await BetDB.find({
        createdAt: {
          $gte: startOfMonth.toDate(),
          $lte: today.toDate(),
        },
      })

      if (allBets.length === 0) throw new Error('No bets found')

      const users = []
      for (let i = 0; i < allBets.length; i++) {
        // if user is not in array of users from type user and betAmount, then add it
        if (!users.some(user => allBets[i].user.equals(user.user))) {
          users.push({
            user: allBets[i].user,
            betAmount: allBets[i].amount,
          })
        }
        // if user is in array of users from type user and betAmount, then add the amount to the existing betAmount
        else {
          const index = users.findIndex(user => allBets[i].user.equals(user.user))
          users[index].betAmount += allBets[i].amount
        }
      }
      // sort users by biggest bet amount
      const sortedUsers = users.sort((a, b) => b.betAmount - a.betAmount)
      // only get top x users
      const leaderboardWinners = sortedUsers.slice(0, this.settings.totalWinners)

      const usersData = [] as ILeaderboardUser[]
      for (let i = 0; i < leaderboardWinners.length; i++) {
        // get userdata from UserDB by leaderboardWinners
        const user = await UserDB.findOne({ _id: leaderboardWinners[i].user })

        usersData.push({
          user_id: user._id,
          username: user.username,
          avatar: user.avatar,
          amount: leaderboardWinners[i].betAmount,
          reward: this.settings.rewards[isWeekly ? 'week' : 'month'][i],
        })
      }

      return await this.safeLeaderboard(usersData, isWeekly)
    } catch (err) {
      this.Logger.error(err)
      return { error: err }
    }
  }

  private async safeLeaderboard(userData: any, isWeekly: boolean): Promise<any> {
    try {
      let filter = {}
      if (isWeekly) {
        // custom string for weekly or monthly
        filter = { week: `${this.leadingZero(moment().isoWeek())}-${moment().year()}` }
      } else {
        filter = { month: `${this.leadingZero(moment().month() + 1)}-${moment().year()}` }
      }
      let leaderboardData = await LeaderboardDB.findOne(filter)
      if (leaderboardData?.confirmed) throw new Error('Leaderboard data is already confirmed')
      await LeaderboardDB.updateOne(
        filter,
        {
          date: new Date(),
          users: userData,
          filter: filter[0],
          confirmed: false,
        },
        { upsert: true, setDefaultsOnInsert: true },
        err => {
          if (err) throw new Error(err)
        }
      )
      leaderboardData = await LeaderboardDB.findOne(filter)
      return leaderboardData
    } catch (err) {
      // this.Logger.error(err)
      return { error: err }
    }
  }

  public async safeAndRewardLeaderboard(isWeekly = false): Promise<any> {
    try {
      // get leaderboard
      const leaderboardData = await this.refreshLeaderboard(isWeekly)

      // reward each user
      leaderboardData.users.forEach(async (user: ILeaderboardUser) => {
        const session = await startSession()
        session.startTransaction()

        const userData = await UserDB.findOne({ _id: user.user_id }).session(session)
        // if user exist, reward and create transaction
        if (userData) {
          await new Transaction({
            to_user_id: userData._id,
            amount: user.reward,
            currency: ETransactionCurrency.Balance,
            type: ETransactionType.LeaderboardRewards,
            status: ETransactionState.Confirmed,
          }).save()
          // update the user balance
          userData.balance += user.reward
          await userData.save()
        }

        await session.commitTransaction()
        session.endSession()
      })
      leaderboardData.confirmed = true
      await leaderboardData.save()
      return { message: 'All users rewarded!' }
    } catch (err) {
      // this.Logger.error(err)
      return { error: err }
    }
  }

  /**
   * function to set the leaderboard rewards
   * @param reward default 0 | amount in cent (100 = $1)
   * @param index default 0 | 0 = first place, 9 = tenth place
   */
  public setReward(reward = 0, index = 0, isWeek = false): number[] {
    this.settings.rewards[isWeek ? 'week' : 'month'][index] = reward
    this.Settings.updateLeaderboardSettings(this.settings.totalWinners, this.settings.rewards)
    return this.settings.rewards
  }

  public setTotalWinners(totalWinners = 0): number {
    this.settings.totalWinners = totalWinners
    this.Settings.updateLeaderboardSettings(this.settings.totalWinners, this.settings.rewards)
    return this.settings.totalWinners
  }

  private leadingZero(num: number): string {
    return num < 10 ? '0' + num : num.toString()
  }

  public async getUserStats(userId: string): Promise<any> {
    try {
      const userData = await UserDB.findById(userId)
      if (!userData) throw new Error('User not found')

      const userTransactions = await Transaction.find({ to_user_id: userId, type: ETransactionType.LeaderboardRewards })

      let totalEarned = 0

      userTransactions.forEach(transaction => {
        totalEarned += transaction.amount
      })

      return { totalEarned }
    } catch (err) {
      this.Logger.error(err)
      return { error: err }
    }
  }
}
