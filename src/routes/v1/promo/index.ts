import * as express from 'express'
import { RequestWithUserData } from '../../../constants/Interfaces'
import Util from '../../../utils'

export default function({ Promo }) {
  const router = express.Router()
  router.get('/', Util.isAdmin, async (req, res) => {
    const { page, perPage } = req.params

    try {
      res.json(
        Util.responseObj({
          response: {
            promos: await Promo.getAllCodes(page, perPage),
          },
        })
      )
    } catch (e) {
      res.status(500).json(Util.responseObj(e))
    }
  })

  router.post('/', Util.isAdmin, async (req: RequestWithUserData, res) => {
    const { code, reward, maxUse } = req.body

    try {
      await Promo.setCode(req.user._id, code, reward, maxUse)
      res.json(
        Util.responseObj({
          response: {
            success: true,
          },
        })
      )
    } catch (e) {
      return res.status(500).json(Util.responseObj(e))
    }
  })

  router.delete('/', Util.isAdmin, async (req: RequestWithUserData, res) => {
    const { id } = req.body

    try {
      await Promo.deleteCode(req.user._id, id)
      res.json(
        Util.responseObj({
          response: {
            success: true,
          },
        })
      )
    } catch (e) {
      return res.status(500).json(Util.responseObj(e))
    }
  })

  router.post('/use', Util.isAuthed, async (req: RequestWithUserData, res) => {
    const { code } = req.body

    try {
      await Promo.useCode(req.user._id, code)
      res.json(
        Util.responseObj({
          response: {
            success: true,
          },
        })
      )
    } catch (e) {
      return res.status(500).json(Util.responseObj(e))
    }
  })

  return router
}
