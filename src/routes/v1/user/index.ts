import * as express from 'express'
import { RequestWithUserData } from '../../../constants/Interfaces'
import Util from '../../../utils'
import { ERROR } from '../../../constants/Errors'

export default function({ User }) {
  const router = express.Router()

  router.get('/', Util.isAuthed, async (req: RequestWithUserData, res) => {
    res.json(
      Util.responseObj({
        response: {
          ...req.user,
          ...{
            level: Util.getLevel(req.user.wagered ? req.user.wagered : 0),
            affiliateCodeUsed: req.user.affiliateUsedId
              ? await User.getUsedAffiliateCode(req.user.affiliateUsedId)
              : null,
          },
        },
      })
    )
  })

  router.get('/inventory', Util.isAuthed, async (req: RequestWithUserData, res) => {
    try {
      res.json(Util.responseObj({ response: await User.getInventory(req.user._id) }))
    } catch (e) {
      res.status(500).json(Util.responseObj(e))
    }
  })

  router.get('/crypto-address/:coin', Util.isAuthed, async (req: RequestWithUserData, res) => {
    const { coin } = req.params

    try {
      res.json(Util.responseObj({ response: await User.getCryptoAddress(coin.toUpperCase(), req.user._id) }))
    } catch (e) {
      res.status(500).json(Util.responseObj(e))
    }
  })

  router.get('/history/bets/:game', Util.isAuthed, async (req: RequestWithUserData, res) => {
    const { page, perPage }: any = req.query

    if (req.params.game && ['coinflip', 'elite', 'silver', 'roulette'].indexOf(req.params.game) === -1)
      return res.status(400).json(Util.responseObj({ code: ERROR.InvalidParams, message: 'INVALID_PARAMS' }))
    try {
      res.json(
        Util.responseObj({
          response: await User.getBetHistory(req.user._id, req.params.game, parseInt(page, 10), parseInt(perPage, 10)),
        })
      )
    } catch (e) {
      res.status(500).json(Util.responseObj(e))
    }
  })

  router.get('/history/payments', Util.isAuthed, async (req: RequestWithUserData, res) => {
    const { page, perPage, transactionTypes }: any = req.query

    if (!transactionTypes)
      return res.status(400).json(Util.responseObj({ code: ERROR.InvalidParams, message: 'INVALID_PARAMS' }))

    const txTypesArray = transactionTypes.split(',').map(num => parseInt(num, 10))

    if (!txTypesArray.length)
      return res.status(400).json(Util.responseObj({ code: ERROR.InvalidParams, message: 'INVALID_PARAMS_TYPES' }))

    try {
      res.json(
        Util.responseObj({
          response: await User.getUserPaymentHistory(
            req.user._id,
            txTypesArray,
            parseInt(page, 10),
            parseInt(perPage, 10)
          ),
        })
      )
    } catch (e) {
      res.status(500).json(Util.responseObj(e))
    }
  })

  router.post('/trade-link', Util.isAuthed, async (req: RequestWithUserData, res) => {
    try {
      const { tradeLink } = req.body
      if (!tradeLink)
        return res.status(400).json(Util.responseObj({ code: ERROR.InvalidParams, message: 'INVALID_PARAMS' }))

      res.json(
        Util.responseObj({
          response: await User.updateSteamTradeUrl(req.user._id, tradeLink),
        })
      )
    } catch (e) {
      res.status(500).json(Util.responseObj(e))
    }
  })

  router.post('/change-rank', Util.isAdmin, async (req, res) => {
    try {
      const { userId, rank } = req.body
      if (!userId || !rank)
        return res.status(400).json(Util.responseObj({ code: ERROR.InvalidParams, message: 'INVALID_PARAMS' }))

      res.json(
        Util.responseObj({
          response: await User.changeRank(userId, rank),
        })
      )
    } catch (e) {
      res.status(500).json(Util.responseObj(e))
    }
  })

  return router
}
