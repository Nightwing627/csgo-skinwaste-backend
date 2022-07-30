import { Router } from 'express'
import Util from '../../../utils'

export default function({ Chat }) {
  const router = Router()

  router.get('/', (req, res) => {
    res.json(Util.responseObj({ response: Chat.get() }))
  })

  return router
}
