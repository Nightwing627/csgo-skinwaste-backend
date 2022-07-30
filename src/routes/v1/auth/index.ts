import * as express from 'express'
import Util from '../../../utils'
import Log from '../../../utils/Logger'
import { ERROR } from '../../../constants/Errors'
import config from 'config'
import JWT from '../../../modules/JWT'

const { Logger } = new Log('routes/v1/Auth')

export default function({ passport, Steam }) {
  const router = express.Router()

  router.get('/steam', (req, res) => {
    res.json(Util.responseObj({ response: Steam.getAuthUrl() }))
  })
  router.get('/steam/callback', (req, res, next) => {
    passport.authenticate('steam', {}, async (err, user, info) => {
      if (err || info) {
        Logger.error(err || info)
        return res.status(400).json(
          Util.responseObj({
            code: ERROR.InvalidParams,
            message: info ? 'Invalid or Failed Login' : info.message,
          })
        )
      }

      res.render('authService', {
        redirectUrl: config.domain.frontend,
        data: {
          success: true,
          response: { token: await JWT.createUserToken({ id: user._id }) },
        },
      })
    })(req, res, next)
  })
  router.get('/logout', (req, res) => {
    req.logout()
    res.redirect(config.domain.frontend)
  })

  return router
}
