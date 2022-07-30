import { Router } from 'express'
import Util from '../../../utils'
import { RequestWithUserData } from '../../../constants/Interfaces'

export default function({ Affiliate }) {
  const router = Router()

  router.get('/me', Util.isAuthed, async (req: RequestWithUserData, res) => {
    const userID = req.user._id
    const aff = await Affiliate.getData(userID)

    return res.json({ response: aff })
  })

  router.post('/code', Util.isAuthed, async (req: RequestWithUserData, res) => {
    const { code } = req.body
    const userID = req.user._id

    try {
      const placedCode = await Affiliate.setCode(code, userID)

      return res.json(Util.responseObj({ response: { placedCode } }))
    } catch (e) {
      return res.status(400).json({ success: false, message: e.message })
    }
  })

  router.post('/use-code', Util.isAuthed, async (req: RequestWithUserData, res) => {
    const { code } = req.body
    const userID = req.user._id

    try {
      const placedCode = await Affiliate.useCode(code, userID)

      return res.json(Util.responseObj({ response: { placedCode } }))
    } catch (e) {
      return res.status(500).json(Util.responseObj(e))
    }
  })

  router.get('/test', Util.isAuthed, async (req: RequestWithUserData, res) => {
    return res.json({ userID: req.user._id })
  })

  router.get('/collect', Util.isAuthed, async (req: RequestWithUserData, res) => {
    const userID = req.user._id
    try {
      return res.json(Util.responseObj({ response: await Affiliate.withdrawAffiliateBalanceToSiteBalance(userID) }))
    } catch (e) {
      return res.status(500).json(Util.responseObj(e))
    }
  })

  router.get('/', Util.isAdmin, async (req, res) => {
    const { page, perPage } = req.params

    try {
      res.json(
        Util.responseObj({
          response: {
            promos: await Affiliate.getAllCodes(page, perPage),
          },
        })
      )
    } catch (e) {
      res.status(500).json(Util.responseObj(e))
    }
  })

  router.post('/change-code', Util.isAdmin, async (req: RequestWithUserData, res) => {
    const { userId, code } = req.body
    try {
      const placedCode = await Affiliate.setCode(code, userId)

      return res.json(Util.responseObj({ response: { placedCode } }))
    } catch (e) {
      return res.status(400).json({ success: false, message: e.message })
    }
  })

  return router
}
