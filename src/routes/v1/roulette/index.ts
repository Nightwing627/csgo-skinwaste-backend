import * as express from 'express'
import { ERROR } from '../../../constants/Errors'
import config from 'config'
import Util from '../../../utils'

export default function({ Roulette }) {
  const router = express.Router()
  router.get('/', async (req, res) => {
    try {
      res.json(
        Util.responseObj({
          response: {
            roulette: await Roulette.getGameData(false),
            // history: null,
          },
        })
      )
    } catch (e) {
      res.status(500).json(Util.responseObj(e))
    }
  })

  router.post('/place-bet', Util.isAuthed, async (req: any, res) => {
    const { field, amount } = req.body

    if (config.isAppProd() && req.user.rank > 1)
      return res.status(400).json(Util.responseObj({ code: ERROR.AdminLock, message: 'NO_BET_YOU_CUCK' }))

    if (!field || !amount || amount <= 0)
      return res.status(400).json(Util.responseObj({ code: ERROR.InvalidParams, message: 'INVALID_PARAMS' }))

    try {
      return res.json(
        Util.responseObj({
          response: await Roulette.placeBet(req.user._id, field, parseInt(amount, 10)),
        })
      )
    } catch (e) {
      return res.status(500).json(Util.responseObj(e))
    }
  })

  return router
}
