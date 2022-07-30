import { Router } from 'express'
import Util from '../../../utils'

export default function({ Leaderboard }) {
  const router = Router()

  // #####-#####-#####-####-#####

  router.get('/monthly', async (req, res) => {
    res.json(Util.responseObj({ response: await Leaderboard.getLeaderboard() }))
  })

  router.get('/weekly', async (req, res) => {
    res.json(Util.responseObj({ response: await Leaderboard.getLeaderboard(true) }))
  })

  // #####-#####-#####-####-#####

  router.get('/refresh/monthly', Util.isAuthed, async (req, res) => {
    res.json(Util.responseObj({ response: await Leaderboard.refreshLeaderboard() }))
  })

  router.get('/refresh/weekly', Util.isAuthed, async (req, res) => {
    res.json(Util.responseObj({ response: await Leaderboard.refreshLeaderboard(true) }))
  })

  // #####-#####-#####-####-#####

  router.get('/safeandreward/monthly', Util.isAdmin, async (req, res) => {
    res.json(Util.responseObj({ response: await Leaderboard.safeAndRewardLeaderboard() }))
  })

  router.get('/safeandreward/weekly', Util.isAdmin, async (req, res) => {
    res.json(Util.responseObj({ response: await Leaderboard.safeAndRewardLeaderboard(true) }))
  })

  // #####-#####-#####-####-#####

  router.post('/set/reward', Util.isAdmin, async (req, res) => {
    const { reward, index, isWeekly } = req.body

    res.json(Util.responseObj({ response: await Leaderboard.setReward(reward, index, isWeekly) }))
  })

  router.post('/set/total', Util.isAdmin, async (req, res) => {
    const { total } = req.body
    res.json(Util.responseObj({ response: await Leaderboard.setTotalWinners(total) }))
  })

  router.get('/user-stats', Util.isAdmin, async (req, res) => {
    const { userId } = req.body
    if (!userId) return res.status(400).json(Util.responseObj({ response: 'false' }))
    res.json(Util.responseObj({ response: await Leaderboard.getUserStats(userId) }))
  })

  return router
}
