import * as express from 'express'
import { Types } from 'mongoose'
import { RequestWithUserData } from '../../../constants/Interfaces'
import config from 'config'
import Log from '../../../utils/Logger'
import { ERROR } from '../../../constants/Errors'
import Util from '../../../utils'

const { Logger } = new Log('route/Test')

export default function({ Test }) {
  const router = express.Router()

  router.use(Util.isAdmin)
  router.use((req, res, next) => {
    if (config.isAppProd())
      return res.json(Util.responseObj({ code: ERROR.InternalError, message: 'TEST_ENDPOINTS_DISABLED_PROD' }))
    next()
  })

  router.get('/give-items', async (req: RequestWithUserData, res) => {
    try {
      const { amount, userId } = req.query as { amount: string; userId: string }

      res.json(Util.responseObj({ response: await Test.giveRandomItems(userId || req.user._id, parseInt(amount, 10)) }))
    } catch (err) {
      Logger.error(err)
      res.json(Util.responseObj(err))
    }
  })

  router.post('/jackpot/test-bet/:alt/:game', async (req: RequestWithUserData, res) => {
    try {
      const test = Types.ObjectId(config.testing.testAccountID)
      res.json(
        Util.responseObj({
          response: await Test.placeJackpotTestBet(req.params.alt === 'true' ? test : req.user._id, req.params.game),
        })
      )
    } catch (e) {
      Logger.error(e)
      res.json(Util.responseObj(e))
    }
  })

  router.get('/coinflip/join/:gameId', async (req, res) => {
    try {
      return res.json(Util.responseObj({ response: await Test.botJoinCoinflip(req.params.gameId) }))
    } catch (e) {
      return res.status(500).json(Util.responseObj(e))
    }
  })

  router.get('/coinflip/create', async (req, res) => {
    try {
      return res.json(Util.responseObj({ response: await Test.botCreateCoinflip() }))
    } catch (e) {
      return res.status(500).json(Util.responseObj(e))
    }
  })

  router.get('/roulette/place-bet/:betType', async (req, res) => {
    try {
      return res.json(Util.responseObj({ response: await Test.placeRouletteBet(req.params.betType) }))
    } catch (e) {
      return res.status(500).json(Util.responseObj(e))
    }
  })

  return router
}
