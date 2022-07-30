import * as express from 'express'
import Util from '../../../utils'

export default function({ Rewards }) {
  const router = express.Router()
  router.get('/', Util.isAuthed, async (req: any, res) => {
    try {
      res.json(
        Util.responseObj({
          response: await Rewards.getTime(req.user._id),
          // history: null,
        })
      )
    } catch (e) {
      res.status(500).json(Util.responseObj(e))
    }
  })

  router.post('/claim', Util.isAuthed, async (req: any, res) => {
    try {
      return res.json(
        Util.responseObj({
          response: await Rewards.getReward(req.user._id),
        })
      )
    } catch (e) {
      return res.status(500).json(Util.responseObj(e))
    }
  })

  router.post('/update', Util.isAdmin, async (req, res) => {
    const { index, reward, wager } = req.body
    try {
      return res.json(
        Util.responseObj({
          response: await Rewards.updateRewardSettings(index, reward, wager),
        })
      )
    } catch (e) {
      return res.status(500).json(Util.responseObj(e))
    }
  })

  return router
}
