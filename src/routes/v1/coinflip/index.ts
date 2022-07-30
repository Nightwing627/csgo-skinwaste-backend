import { Router } from 'express'
import Util from '../../../utils'
import { RequestWithUserData } from '../../../constants/Interfaces'
import { ERROR } from '../../../constants/Errors'
import config from 'config'

export default function({ Coinflip }) {
  const router = Router()

  router.get('/', async (req, res) => {
    try {
      return res.json(Util.responseObj({ response: await Coinflip.get() }))
    } catch (e) {
      return res.status(500).json(Util.responseObj(e))
    }
  })

  router.get('/history', async (req, res) => {
    try {
      return res.json(Util.responseObj({ response: await Coinflip.getHistory() }))
    } catch (e) {
      return res.status(500).json(Util.responseObj(e))
    }
  })

  router.get('/:gameId', async (req, res) => {
    if (!req.params.gameId)
      return res.status(400).json(Util.responseObj({ code: ERROR.InvalidParams, message: 'INVALID_PARAMS' }))
    try {
      return res.json(Util.responseObj({ response: await Coinflip.getGame(req.params.gameId) }))
    } catch (e) {
      return res.status(500).json(Util.responseObj(e))
    }
  })

  router.post('/create', Util.isAuthed, async (req: RequestWithUserData, res) => {
    try {
      const { backpackIds, side } = req.body

      if (config.isAppProd() && req.user.rank > 1)
        return res.status(400).json(Util.responseObj({ code: ERROR.AdminLock, message: 'NO_BET_YOU_CUCK' }))

      if (!backpackIds || !backpackIds.length || !side)
        return res.status(400).json(Util.responseObj({ code: ERROR.InvalidParams, message: 'INVALID_PARAMS' }))

      return res.json(
        Util.responseObj({ response: await Coinflip.createGame(req.user._id, backpackIds.split(','), side) })
      )
    } catch (e) {
      return res.status(500).json(Util.responseObj(e))
    }
  })

  router.post('/join', Util.isAuthed, async (req: RequestWithUserData, res) => {
    try {
      const { gameId, backpackIds } = req.body

      if (config.isAppProd() && req.user.rank > 1)
        return res.status(400).json(Util.responseObj({ code: ERROR.AdminLock, message: 'NO_BET_YOU_CUCK' }))

      if (!backpackIds || !backpackIds.length || !gameId || !gameId.length)
        return res.status(400).json(Util.responseObj({ code: ERROR.InvalidParams, message: 'INVALID_PARAMS' }))

      return res.json(
        Util.responseObj({ response: await Coinflip.joinGame(gameId, req.user._id, backpackIds.split(',')) })
      )
    } catch (e) {
      return res.status(500).json(Util.responseObj(e))
    }
  })

  router.delete('/delete', Util.isAuthed, async (req: RequestWithUserData, res) => {
    try {
      const { gameId } = req.body

      if (!gameId)
        return res.status(400).json(Util.responseObj({ code: ERROR.InvalidParams, message: 'INVALID_PARAMS' }))

      await Coinflip.cancelGame(req.user._id, gameId)
      return res.status(204).send()
    } catch (e) {
      return res.status(500).json(Util.responseObj(e))
    }
  })

  return router
}
