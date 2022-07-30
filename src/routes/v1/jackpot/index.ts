import * as express from 'express'
import { ERROR } from '../../../constants/Errors'
import { RequestWithUserData } from '../../../constants/Interfaces'
import config from 'config'
import Util from '../../../utils'

export default function({ Jackpot, SilverJackpot }) {
  const router = express.Router()
  router.get('/', async (req, res) => {
    try {
      res.json(
        Util.responseObj({
          response: {
            elite: await Jackpot.getGameData(false),
            silver: await SilverJackpot.getGameData(false),
            history: {
              elite: await Jackpot.getHistory(),
              silver: await SilverJackpot.getHistory(),
            },
          },
        })
      )
    } catch (e) {
      res.status(500).json(Util.responseObj(e))
    }
  })

  router.post('/place-bet/:game', Util.isAuthed, async (req: RequestWithUserData, res) => {
    const { itemIds } = req.body
    const { game } = req.params

    if (config.isAppProd() && req.user.rank > 1)
      return res.status(400).json(Util.responseObj({ code: ERROR.AdminLock, message: 'NO_BET_YOU_CUCK' }))

    if (!itemIds || !itemIds.length)
      return res.status(400).json(Util.responseObj({ code: ERROR.InvalidParams, message: 'INVALID_PARAMS' }))

    try {
      return res.json(
        Util.responseObj({
          response:
            game === 'elite'
              ? await Jackpot.placeBet(req.user._id, itemIds.split(','))
              : await SilverJackpot.placeBet(req.user._id, itemIds.split(',')),
        })
      )
    } catch (e) {
      return res.status(500).json(Util.responseObj(e))
    }
  })

  return router
}
