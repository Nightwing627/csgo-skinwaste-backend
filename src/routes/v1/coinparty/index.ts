import { Router } from 'express'
import Util from '../../../utils'

export default function({ CoinParty }) {
  const router = Router()

  router.get('/', async (req, res) => {
    try {
      res.json(Util.responseObj({ response: await CoinParty.getCoinParty() }))
    } catch (err) {
      // console.log(err)
      res.json(Util.responseObj({ response: { error: err } }))
    }
  })

  // #####-#####-#####-####-#####

  router.post('/join', Util.isAuthed, async (req: any, res) => {
    try {
      res.json(Util.responseObj({ response: await CoinParty.joinCoinParty(req.user._id) }))
    } catch (err) {
      // console.log(err)
      res.json(Util.responseObj({ response: { error: err } }))
    }
  })

  router.post('/create', Util.isAuthed, async (req: any, res) => {
    try {
      const { amount } = req.body
      const { coinparty } = await CoinParty.createCoinParty(req.user._id, amount)
      res.json(Util.responseObj({ response: coinparty }))
    } catch (err) {
      // console.log(err)
      res.json(Util.responseObj({ response: { error: err } }))
    }
  })

  router.post('/donate', Util.isAuthed, async (req: any, res) => {
    const { amount } = req.body
    try {
      const { coinparty } = await CoinParty.donateToCoinParty(req.user._id, amount)
      res.json(Util.responseObj({ response: coinparty }))
    } catch (err) {
      // console.log(err)
      res.json(Util.responseObj({ response: { error: err } }))
    }
  })

  return router
}
