import v1 from './v1'
import * as express from 'express'

export default function(Services) {
  const router = express.Router()

  router.use('/v1', v1(Services))
  return router
}
