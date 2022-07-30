import { Router } from 'express'
import Util from '../../../utils'
import { RequestWithUserData } from '../../../constants/Interfaces'
import { ERROR } from '../../../constants/Errors'
import Logger from '../../../utils/Logger'
import APIDebugger from '../../../models/APIDebugger'

async function debugFN(req, res, next) {
  const debug = await APIDebugger.create({
    location: 'Crypto',
    data: JSON.stringify({ body: req.body, query: req.query, params: req.params }),
    action: req.url,
  })
  debug.save()
  next()
}

export default function({ Crypto, Settings }) {
  const router = Router()

  router.get('/rates', async (req, res) => {
    try {
      const { rates } = await Settings.getCryptoSettings()
      res.json(Util.responseObj({ response: rates }))
    } catch (e) {
      res.status(500).json(Util.responseObj(e))
    }
  })

  router.post('/withdrawal/:coin', Util.isAdmin, async (req: RequestWithUserData, res) => {
    const { coin } = req.params
    const { address, amount } = req.body

    const { minWithdrawalAmount } = await Settings.getCryptoSettings()

    if (!Util.isInt(parseInt(amount, 10)))
      return res.status(400).json(Util.responseObj({ code: ERROR.InvalidParams, message: 'AMOUNT_MUST_BE_INT' }))

    if (amount < minWithdrawalAmount)
      return res
        .status(400)
        .json(Util.responseObj({ code: ERROR.InvalidParams, message: `MIN_WITHDRAWAL_${minWithdrawalAmount}` }))

    try {
      res.json(Util.responseObj({ response: await Crypto.createWithdrawRequest(req.user._id, address, amount, coin) }))
    } catch (e) {
      res.status(500).json(Util.responseObj(e))
    }
  })

  router.get('/check-payments/:coin', Util.isAdmin, async (req: RequestWithUserData, res) => {
    const { coin } = req.params
    try {
      res.json(Util.responseObj({ response: await Crypto.getLogs(req.user._id, coin) }))
    } catch (e) {
      res.status(500).json(Util.responseObj(e))
    }
  })

  router.get('/callback', debugFN, async (req, res) => {
    try {
      const payload = req.query

      const log = new Logger('payment route').Logger
      log.info('got callback', payload)
      switch (payload.type) {
        case 'deposit':
          await Crypto.processDepositIPN(payload)
          break
        case 'withdrawal':
          await Crypto.processWithdrawIPN(payload)
          break
        default:
          break
      }

      res.status(200).send('*ok*')
    } catch (e) {
      res.status(500).json(Util.responseObj(e))
    }
  })

  return router
}
