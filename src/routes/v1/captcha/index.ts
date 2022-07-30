import { Router } from 'express'
import Util from '../../../utils'

export default function({ Captcha }) {
  const router = Router()

  router.get('/', async (req, res) => {
    res.json(Util.responseObj({ response: Captcha.createCaptcha() }))
  })

  router.post('/validate', async (req, res) => {
    const { _id, text } = req.body
    res.json(Util.responseObj({ response: await Captcha.validateCaptcha(_id, text) }))
  })

  return router
}
