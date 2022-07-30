/* eslint-disable no-param-reassign */
import * as Steam from 'passport-steam'
import config from 'config'
import User from '../models/User'

const SteamStrategy = Steam.Strategy

module.exports = passport => {
  passport.serializeUser((user, done) => {
    done(null, user.id)
  })

  passport.use(
    new SteamStrategy(
      {
        returnURL: config.auth.returnURL,
        realm: config.auth.realm,
        apiKey: config.auth.apiKey,
        passReqToCallback: true,
      },
      async (req, identifier, profile, done) => {
        User.findOne({ steamID: profile.id })
          .then(async user => {
            if (!user) {
              try {
                const userSaved = await new User({
                  steamID: profile.id,
                  username: profile.displayName,
                  avatar: profile.photos[2].value,
                  lastIP: req.headers['cf-connecting-ip'],
                  country: req.headers['cf-ipcountry'],
                }).save()
                return done(null, userSaved)
              } catch (e) {
                done(e)
              }
            } else {
              user.username = profile.displayName
              user.avatar = profile.photos[2].value
              user.lastIP = req.headers['cf-connecting-ip']
              user.country = req.headers['cf-ipcountry']
              user
                .save()
                // eslint-disable-next-line no-shadow
                .then(user => {
                  return done(null, user)
                })
                .catch(err => {
                  return done(err)
                })
            }
          })
          .catch(err => {
            return done(err)
          })
      }
    )
  )

  passport.deserializeUser((id, done) => {
    User.findById(id)
      .lean()
      .then(user => {
        if (!user) return done(null, false, { success: false, error: 'USER_NOT_FOUND' })
        return done(null, user)
      })
      .catch(err => {
        return done(err)
      })
  })
}
