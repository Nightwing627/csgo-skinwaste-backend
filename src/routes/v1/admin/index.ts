import { Router } from 'express'
import Bet from '../../../models/Bet'
import Config from '../../../models/Config'
import User, { EBanLevel } from '../../../models/User'
import Affiliates from '../../../models/Affiliate'
import Util from '../../../utils'
import _ from 'lodash'
import { Types } from 'mongoose'
import Item from '../../../models/Item'

export default function({ Affiliate, Settings }) {
  const router = Router()

  router.get('/dashboard/general/users/:months', Util.isAdmin, async (req, res) => {
    const months = parseInt(req.params.months, 10)
    const count = await User.countDocuments({})
    const usersLastPeriod = await User.countDocuments({
      createdAt: {
        $gt: new Date(new Date().getTime() - months * 30 * 24 * 60 * 60 * 1e3),
      },
    })
    const userIncreasePercentage = (usersLastPeriod / count) * 100
    res.json(Util.responseObj({ response: { count, userIncreasePercentage } }))
  })

  router.get('/dashboard/general/bets/:months', Util.isAdmin, async (req, res) => {
    const months = parseInt(req.params.months, 10)

    const bets = await Bet.aggregate([
      {
        $match: {
          createdAt: {
            $gt: new Date(new Date().getTime() - months * 30 * 24 * 60 * 60 * 1e3),
          },
        },
      },
      { $group: { _id: { month: { $month: '$createdAt' } }, total_amount: { $sum: '$amount' } } },
      { $sort: { '_id.month': -1 } },
    ])
    return res.json(Util.responseObj({ response: { bets } }))
  })

  router.get('/dashboard/general/:feature/bets/:months', Util.isAdmin, async (req, res) => {
    const months = parseInt(req.params.months, 10)
    const game = req.params.feature

    const bets = await Bet.aggregate([
      {
        $match: {
          gameType: { $eq: game },
          createdAt: {
            $gt: new Date(new Date().getTime() - months * 30 * 24 * 60 * 60 * 1e3),
          },
        },
      },
      { $group: { _id: { month: { $month: '$createdAt' } }, total_amount: { $sum: '$amount' } } },
      { $sort: { '_id.month': -1 } },
    ])
    return res.json(Util.responseObj({ response: { bets } }))
  })

  router.get('/dashboard/general/rake/:months', Util.isAdmin, async (req, res) => {
    const months = parseInt(req.params.months, 10)
    const games = ['coinflip', 'silver', 'jackpot']
    const settings = await Config.find({ feature: { $in: games } })
    const taxes = Object.assign({}, ...settings.map(item => ({ [item.feature]: item.settings.rake })))
    const result: any = {}
    for await (const game of games) {
      const bets = await Bet.aggregate([
        {
          $match: {
            gameType: { $eq: game },
            createdAt: {
              $gt: new Date(new Date().getTime() - months * 30 * 24 * 60 * 60 * 1e3),
            },
          },
        },
        {
          $group: {
            _id: {
              month: { $month: '$createdAt' },
              year: { $year: '$createdAt' },
            },
            total_amount: {
              $sum: {
                $multiply: ['$amount', taxes[game]],
              },
            },
          },
        },
        { $sort: { '_id.month': -1, '_id.year': -1 } },
      ])
      result[game] = bets
    }

    let total = 0
    _.forEach(result, bet => {
      total += _.sumBy(bet, 'total_amount')
    })
    result.total = total
    return res.json(Util.responseObj({ response: { result } }))
  })

  router.get('/dashboard/general/:feature/rake/:months', Util.isAdmin, async (req, res) => {
    const months = parseInt(req.params.months, 10)
    const games = req.params.feature
    const settings = await Config.findOne({ feature: { $eq: games } })
    const tax = settings.settings.rake

    const result = await Bet.aggregate([
      {
        $match: {
          gameType: { $eq: games },
          createdAt: {
            $gt: new Date(new Date().getTime() - months * 30 * 24 * 60 * 60 * 1e3),
          },
        },
      },
      {
        $group: {
          _id: {
            month: { $month: '$createdAt' },
            year: { $year: '$createdAt' },
          },
          total_amount: {
            $sum: {
              $multiply: ['$amount', tax],
            },
          },
        },
      },
      { $sort: { '_id.month': -1, '_id.year': -1 } },
    ])

    return res.json(Util.responseObj({ response: { result } }))
  })

  router.get('/dashboard/actions', Util.isAdmin, async (req, res) => {
    const settings = await Config.findOne({ feature: 'site' }).lean()
    res.json(Util.responseObj({ response: { settings: settings.settings.enabled } }))
  })

  router.put('/dashboard/actions/:feature', Util.isAdmin, async (req, res) => {
    const { feature } = req.params
    const config = await Config.findOne({ feature: 'site' }).lean()
    config.settings.enabled[feature] = !config.settings.enabled[feature]
    await Config.update({ feature: 'site' }, config, { overwrite: true })
    res.json(Util.responseObj({ response: { settings: config.settings.enabled } }))
  })

  router.get('/dashboard/allowed-coins', Util.isAdmin, async (req, res) => {
    const cryptoSettings = await Config.findOne({ feature: 'crypto' }).lean()
    res.json(
      Util.responseObj({
        response: {
          allowedCoins: cryptoSettings.settings.allowedCoins,
        },
      })
    )
  })

  router.put('/dashboard/allowed-coins', Util.isAdmin, async (req, res) => {
    const cryptoSettings = await Config.findOne({ feature: 'crypto' }).lean()

    cryptoSettings.settings.allowedCoins = req.body.allowedCoins
    await Config.update({ feature: 'crypto' }, cryptoSettings, { overwrite: true })
    res.json(
      Util.responseObj({
        response: {
          allowedCoins: cryptoSettings.settings.allowedCoins,
        },
      })
    )
  })

  router.get('/users/overview', Util.isAdmin, async (req, res) => {
    const users = await User.paginate()
    res.json(
      Util.responseObj({
        response: {
          users,
        },
      })
    )
  })

  router.get('/users/overview/banned-users', Util.isAdmin, async (req, res) => {
    const users = await User.paginate({ banned: { $in: [EBanLevel.Site] } })
    res.json(
      Util.responseObj({
        response: {
          users,
        },
      })
    )
  })

  router.get('/users/overview/total/:months', Util.isAdmin, async (req, res) => {
    const months = parseInt(req.params.months, 10)
    const totalUsers = await User.countDocuments()
    const users = await User.aggregate([
      {
        $match: {
          createdAt: {
            $gt: new Date(new Date().getTime() - months * 30 * 24 * 60 * 60 * 1e3),
          },
        },
      },
      { $group: { _id: { month: { $month: '$createdAt' }, year: { $year: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
    ])
    return res.json(Util.responseObj({ response: { users, totalUsers } }))
  })

  router.get('/users/overview/banned', Util.isAdmin, async (req, res) => {
    const users = await User.countDocuments({
      banned: {
        $in: [EBanLevel.Site],
      },
    })
    res.json(
      Util.responseObj({
        response: {
          users,
        },
      })
    )
  })

  router.put('/users/:id', Util.isAdmin, async (req, res) => {
    const { id } = req.params
    const user = await User.findById(req.params.id)

    for (const [key, value] of Object.entries(req.body.user)) {
      user[key] = value
    }

    const updatedUser = await User.update({ _id: id }, user, { overwrite: true })
    res.json(
      Util.responseObj({
        response: {
          updatedUser,
        },
      })
    )
  })

  router.get('/users/:id/details', Util.isAdmin, async (req, res) => {
    const { id } = req.params

    const user = await User.findById({ _id: id }).lean()
    res.json(
      Util.responseObj({
        response: {
          user,
        },
      })
    )
  })

  router.get('/users/:id/bets/:type/:months', Util.isAdmin, async (req, res) => {
    const months = parseInt(req.params.months, 10)
    const { type, id } = req.params

    const bets = await Bet.aggregate([
      {
        $match: {
          createdAt: {
            $gt: new Date(new Date().getTime() - months * 30 * 24 * 60 * 60 * 1e3),
          },
          user: {
            $eq: new Types.ObjectId(id),
          },
          gameType: {
            $eq: type,
          },
        },
      },
      { $group: { _id: { month: { $month: '$createdAt' } }, total_amount: { $sum: '$amount' } } },
    ]).sort({ createdAt: -1 })
    return res.json(Util.responseObj({ response: { bets } }))
  })

  router.get('/users/:id/rake/:type/:months', Util.isAdmin, async (req, res) => {
    const months = parseInt(req.params.months, 10)
    const { type, id } = req.params

    const settings = await Config.findOne({ feature: type })

    const bets = await Bet.aggregate([
      {
        $match: {
          gameType: { $eq: type },
          createdAt: {
            $gt: new Date(new Date().getTime() - months * 30 * 24 * 60 * 60 * 1e3),
          },
          user: { $eq: new Types.ObjectId(id) },
        },
      },
      {
        $group: {
          _id: {
            month: { $month: '$createdAt' },
            year: { $year: '$createdAt' },
          },
          total_amount: {
            $sum: {
              $multiply: ['$amount', settings.settings.rake],
            },
          },
        },
      },
      { $sort: { '_id.month': -1, '_id.year': -1 } },
    ])
    return res.json(Util.responseObj({ response: { bets } }))
  })

  router.get('/users/:id/profit', Util.isAdmin, async (req, res) => {
    const { id } = req.params

    const user = await User.findById({ _id: id })

    return res.json(Util.responseObj({ response: { total_profit: user.won } }))
  })

  router.post('/affiliates', Util.isAdmin, async (req, res) => {
    const { id, code } = req.body

    const placedCode = await Affiliate.setCode(code, id)

    return res.json(Util.responseObj({ response: { placedCode } }))
  })

  router.put('/affiliates/:id', Util.isAdmin, async (req, res) => {
    const { id } = req.params
    const affiliate = await Affiliates.findById(req.params.id)

    for (const [key, value] of Object.entries(req.body.affiliate)) {
      affiliate[key] = value
    }

    const updatedAffiliates = await Affiliates.update({ _id: id }, affiliate, { overwrite: true })
    res.json(
      Util.responseObj({
        response: {
          updatedAffiliates,
        },
      })
    )
  })

  router.get('/affiliates', Util.isAdmin, async (req, res) => {
    const affiliates = await Affiliates.find()

    return res.json(Util.responseObj({ response: { affiliates } }))
  })

  router.get('/market', Util.isAdmin, async (req, res) => {
    const items = await Item.find()

    return res.json(Util.responseObj({ response: { items } }))
  })

  router.post('/market', Util.isAdmin, async (req, res) => {
    const items = await Item.create(req.body)

    return res.json(Util.responseObj({ response: { items } }))
  })

  router.delete('/market/:id', Util.isAdmin, async (req, res) => {
    const { id } = req.params
    const item = await Item.deleteOne({ _id: id })

    return res.json(Util.responseObj({ response: { item } }))
  })

  router.put('/market/:id', Util.isAdmin, async (req, res) => {
    const { id } = req.params
    const item = await Item.findOne({ _id: id })

    for (const [key, value] of Object.entries(req.body.item)) {
      item[key] = value
    }
    const updatedItem = await Item.update({ _id: id }, item, { overwrite: true })
    res.json(
      Util.responseObj({
        response: {
          updatedItem,
        },
      })
    )
  })

  router.get('/countdown', Util.isAdmin, async (req, res) => {
    try {
      return res.json(Util.responseObj({ response: { countdown: await Settings.getCountdown() } }))
    } catch (err) {
      return res.json(Util.responseObj({ response: { countdown: err.message } }))
    }
  })

  router.get('/toggle-countdown', Util.isAdmin, async (req, res) => {
    try {
      await Settings.toggleCountdown()

      return res.json(Util.responseObj({ response: { countdown: await Settings.getCountdown() } }))
    } catch (err) {
      return res.json(Util.responseObj({ response: { error: err.message } }))
    }
  })

  router.post('/set-countdown', Util.isAdmin, async (req, res) => {
    try {
      await Settings.setCountdown(req.body.countdown)

      return res.json(Util.responseObj({ response: { countdown: await Settings.getCountdown() } }))
    } catch (err) {
      return res.json(Util.responseObj({ response: { error: err.message } }))
    }
  })

  return router
}
