import * as express from 'express'
import Util from '../../../utils'
import config from '../../../../config/default'
import APIDebugger from '../../../models/APIDebugger'

async function debugFN(req, res, next) {
  const debug = await APIDebugger.create({
    location: 'SkinsBack',
    data: JSON.stringify({ body: req.body, query: req.query, params: req.params }),
    action: req.url,
  })
  debug.save()
  next()
}

export default function({ SkinsBack }) {
  const router = express.Router()
  router.get('/url', Util.isAuthed, async (req: any, res) => {
    // this url is called from the frontend to get the url from the skinsback api
    try {
      return res.json(
        Util.responseObj({
          response: {
            depositUrl: (await SkinsBack.getDepositUrl(req.user._id)).url,
          },
        })
      )
    } catch (e) {
      // console.log(e)
      return res.status(500).json(Util.responseObj(e))
    }
  })

  router.get('/success', debugFN, async (req, res) => {
    res.redirect(config.domain.frontend)
    // res.send('ok')
  })
  router.get('/fail', debugFN, async (req, res) => {
    res.redirect(config.domain.frontend)
    // res.send('ok')
  })

  router.post('/result', debugFN, async (req, res) => {
    // this url is called from the skinsback api on result
    try {
      await SkinsBack.handleCallback(req.body)
      // console.log(req.query)
      res.status(200).send('ok')
    } catch (e) {
      // console.log(e)
      res.status(500).json(Util.responseObj(e))
    }
  })

  return router
}
