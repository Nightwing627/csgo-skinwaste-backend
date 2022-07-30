import * as express from 'express'
import admin from './admin'
import affiliates from './affiliates'
import auth from './auth'
import chat from './chat'
import coinflip from './coinflip'
import config from './config'
import jackpot from './jackpot'
import payments from './payments'
import roulette from './roulette'
import store from './store'
import test from './test'
import user from './user'
import leaderboard from './leaderboard'
import coinParty from './coinparty'
import promo from './promo'
import captcha from './captcha'
import rustysell from './rustysell'
import rewards from './rewards'
import skinsback from './skinsback'

export default function(Services) {
  const router = express.Router()

  router.use('/auth', auth(Services))
  router.use('/roulette', roulette(Services))
  router.use('/test', test(Services))
  router.use('/config', config(Services))
  router.use('/jackpot', jackpot(Services))
  router.use('/user', user(Services))
  router.use('/store', store(Services))
  router.use('/coinflip', coinflip(Services))
  router.use('/payments', payments(Services))
  router.use('/chat', chat(Services))
  router.use('/admin', admin(Services))
  router.use('/affiliates', affiliates(Services))
  router.use('/leaderboard', leaderboard(Services))
  router.use('/coinparty', coinParty(Services))
  router.use('/promo', promo(Services))
  router.use('/captcha', captcha(Services))
  router.use('/rustysell', rustysell(Services))
  router.use('/rewards', rewards(Services))
  router.use('/skinsback', skinsback(Services))

  return router
}
