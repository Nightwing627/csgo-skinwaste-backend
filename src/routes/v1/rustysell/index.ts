import * as express from 'express'
import { RequestWithUserData } from '../../../constants/Interfaces'
import Util from '../../../utils'
import APIDebugger from '../../../models/APIDebugger'

async function debugFN(req, res, next) {
  const debug = await APIDebugger.create({
    location: 'RustySell',
    data: JSON.stringify({ body: req.body, query: req.query, params: req.params }),
    action: req.url,
  })
  debug.save()
  next()
}

export default function({ RustySell }) {
  const router = express.Router()

  router.get('/url', Util.isAuthed, async (req: RequestWithUserData, res) => {
    try {
      return res.json(
        Util.responseObj({
          response: {
            depositUrl: await RustySell.getDepositUrl(req.user._id),
          },
        })
      )
    } catch (e) {
      return res.status(500).json(Util.responseObj(e))
    }
  })

  router.post('/callback', debugFN, async (req: RequestWithUserData, res) => {
    try {
      await RustySell.verifySignature(req.body)
      return res.json({ status: 'success' })
    } catch (e) {
      return res.status(500).json(Util.responseObj(e))
    }
  })

  return router
}
