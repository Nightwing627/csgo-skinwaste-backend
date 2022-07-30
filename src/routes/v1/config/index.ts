import * as express from 'express'
import Util from '../../../utils'

export default function({ Settings }) {
  const router = express.Router()

  router.get('/', async (req, res) => {
    try {
      res.json(
        Util.responseObj({
          response: {
            site: await Settings.getSiteSettings(true),
            jackpot: await Settings.getJackpotsSettings(),
            crypto: await Settings.getCryptoSettings(),
            affiliate: await Settings.getAffiliateSettings(),
            coinflip: await Settings.getCoinflipSettings(),
            leaderboard: await Settings.getLeaderboardSettings(),
            coinparty: await Settings.getCoinpartySettings(),
            roulette: await Settings.getRouletteSettings(),
          },
        })
      )
    } catch (e) {
      res.status(500).json(Util.responseObj(e))
    }
  })

  return router
}
