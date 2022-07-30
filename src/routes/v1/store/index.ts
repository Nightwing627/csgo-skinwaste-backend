import { Router } from 'express'
import Util from '../../../utils'
import { ERROR } from '../../../constants/Errors'
import { RequestWithUserData } from '../../../constants/Interfaces'

export default function({ Items, Crypto }) {
  const router = Router()

  router.get('/', async (req, res) => {
    try {
      res.json(Util.responseObj({ response: await Items.getActiveItems() }))
    } catch (e) {
      res.status(500).json(Util.responseObj(e))
    }
  })

  router.post('/tip', Util.isAuthed, async (req: RequestWithUserData, res) => {
    try {
      const { backpackIds, toUserID } = req.body
      const backpackIdsArr = Util.validateCommaSeparatedListObjectIdAndReturnArray(backpackIds)

      if (!backpackIdsArr.length || !toUserID)
        return res.status(400).json(Util.responseObj({ code: ERROR.InvalidParams, message: 'INVALID_PARAMS' }))

      res.json(Util.responseObj({ response: await Items.tipItems(backpackIdsArr, req.user._id, toUserID) }))
    } catch (e) {
      return res.status(500).json(Util.responseObj(e))
    }
  })

  router.post('/purchase', Util.isAuthed, async (req: RequestWithUserData, res) => {
    try {
      const { itemIds } = req.body
      const itemIdsArray = Util.validateCommaSeparatedListObjectIdAndReturnArray(itemIds)

      if (!itemIdsArray.length)
        return res.status(400).json(Util.responseObj({ code: ERROR.InvalidParams, message: 'INVALID_PARAMS' }))

      res.json(Util.responseObj({ response: await Items.buyItems(itemIdsArray, req.user._id) }))
    } catch (e) {
      return res.status(500).json(Util.responseObj(e))
    }
  })

  router.post('/sell', Util.isAuthed, async (req: RequestWithUserData, res) => {
    try {
      const { backpackIds } = req.body
      const backpackIdsArr = Util.validateCommaSeparatedListObjectIdAndReturnArray(backpackIds)

      if (!backpackIdsArr.length)
        return res.status(400).json(Util.responseObj({ code: ERROR.InvalidParams, message: 'INVALID_PARAMS' }))

      res.json(Util.responseObj({ response: await Items.sellItems(backpackIdsArr, req.user._id) }))
    } catch (e) {
      return res.status(500).json(Util.responseObj(e))
    }
  })

  router.post('/cashout', Util.isAuthed, async (req: RequestWithUserData, res) => {
    try {
      const { amount, address, currency } = req.body

      if (!Util.isInt(parseInt(amount, 10)) || !amount || !address || !currency)
        return res.status(400).json(Util.responseObj({ code: ERROR.InvalidParams, message: 'INVALID_PARAMS' }))

      res.json(
        Util.responseObj({
          response: await Items.cashOut(parseInt(amount, 10), req.user._id, currency.toLowerCase(), address),
        })
      )
    } catch (e) {
      return res.status(500).json(Util.responseObj(e))
    }
  })

  router.get('/csgo-store', async (req, res) => {
    try {
      return res.json(Util.responseObj({ response: await Items.getWAXPeerItems() }))
    } catch (e) {
      return res.status(500).json(Util.responseObj(e))
    }
  })

  router.post('/buy-csgo', Util.isAuthed, async (req: RequestWithUserData, res) => {
    try {
      const { itemIds } = req.body
      const itemIdsArr = Util.validateCommaSeparatedListObjectIdAndReturnArray(itemIds)

      if (!itemIdsArr.length)
        return res.status(400).json(Util.responseObj({ code: ERROR.InvalidParams, message: 'INVALID_PARAMS' }))

      return res.json(Util.responseObj({ response: await Items.requestItemFromWAXPeer(req.user._id, itemIdsArr) }))
    } catch (e) {
      return res.status(500).json(Util.responseObj(e))
    }
  })

  router.post('/gas-rate', Util.isAuthed, async (req: RequestWithUserData, res) => {
    const { address, amount } = req.body
    try {
      return res.json(Util.responseObj({ response: await Crypto.getEthGasPrice(address, amount) }))
    } catch (e) {
      return res.status(500).json(Util.responseObj(e))
    }
  })

  return router
}
