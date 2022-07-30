import * as express from 'express'
import Chance from 'chance'
import crypto from 'crypto'
import User from '../models/User'
import { ERROR } from '../constants/Errors'
import JWT from '../modules/JWT'

interface IResponseObj {
  success?: boolean
  time?: number
  code?: number | null
  message?: string | null
  errors?: any | null
  response?: string | object | null
}

interface IUtil {
  responseObj(object: IResponseObj): IResponseObj
}

class Util implements IUtil {
  public getRandomNumber = (min, max) => {
    return new Chance().integer({ min, max })
  }

  public getRandomString = len => {
    return new Chance().hash({ length: len })
  }

  public genGameHash = serverSeed => {
    return crypto
      .createHash('sha256')
      .update(serverSeed)
      .digest('hex')
  }

  public isInt = nVal => {
    return (
      typeof nVal === 'number' &&
      isFinite(nVal) &&
      nVal > -9007199254740992 &&
      nVal < 9007199254740992 &&
      Math.floor(nVal) === nVal
    )
  }

  public getLevel = (exp): number => {
    const x = 25.93
    const y = -263.8
    const z = Math.exp((1 - y) / x)
    return Math.max(Math.floor(x * Math.log(exp + z) + y), 1)
  }

  public validateCommaSeparatedListObjectIdAndReturnArray = s => {
    const regex = /(ObjectId\(')?[0-9a-fA-F]{24}('\))?/g

    const array = s.split(',')

    let pass = true

    for (const key of array) {
      if (!key.match(regex)) pass = false
    }

    if (!pass) return []
    return array
  }

  public sleep(ms: number) {
    new Promise(res => {
      setTimeout(res, ms)
    })
  }

  public responseObj = ({
    code = null,
    message = null,
    errors = null,
    response = null,
  }: IResponseObj): IResponseObj => {
    if (code !== null) {
      return {
        success: false,
        time: Date.now(),
        code,
        message,
        errors,
      }
    }
    return {
      success: true,
      time: Date.now(),
      response,
    }
  }

  public isMod = async (req, res: express.Response, next: express.NextFunction) => {
    let token = req.headers.authorization

    if (!token) {
      return res.status(400).json(this.responseObj({ code: ERROR.InvalidToken, message: 'INVALID_TOKEN' }))
    }

    token = token.slice(7, token.length)

    try {
      const decoded: any = await JWT.validateToken(token)
      const user = await User.findById(decoded.data.id).lean()
      if (!user) return res.status(400).json(this.responseObj({ code: ERROR.UserNotFound, message: 'USER_NOT_FOUND' }))
      if (user.rank >= 2) {
        req.user = user
        next()
      } else {
        res.status(403).json(this.responseObj({ code: ERROR.InsufficientPrivilege, message: 'INSUFFICIENT_PRIVILEGE' }))
      }
    } catch (e) {
      res.status(400).json(this.responseObj(e))
    }
  }

  public isAdmin = async (req, res: express.Response, next: express.NextFunction) => {
    let token = req.headers.authorization

    if (!token) {
      return res.status(400).json(this.responseObj({ code: ERROR.InvalidToken, message: 'INVALID_TOKEN' }))
    }

    token = token.slice(7, token.length)

    try {
      const decoded: any = await JWT.validateToken(token)
      const user = await User.findById(decoded.data.id).lean()
      if (!user) return res.status(400).json(this.responseObj({ code: ERROR.UserNotFound, message: 'USER_NOT_FOUND' }))
      if (user.rank === 3) {
        req.user = user
        next()
      } else {
        res.status(403).json(this.responseObj({ code: ERROR.InsufficientPrivilege, message: 'INSUFFICIENT_PRIVILEGE' }))
      }
    } catch (e) {
      res.status(400).json(this.responseObj(e))
    }
  }

  public isAuthed = async (req, res: express.Response, next: express.NextFunction) => {
    let token = req.headers.authorization

    if (!token) {
      return res.status(400).json(this.responseObj({ code: ERROR.InvalidToken, message: 'INVALID_TOKEN' }))
    }

    token = token.slice(7, token.length)

    try {
      const decoded: any = await JWT.validateToken(token)
      const user = await User.findById(decoded.data.id)
      if (!user) return res.status(400).json(this.responseObj({ code: ERROR.UserNotFound, message: 'USER_NOT_FOUND' }))
      if (!user.remoteAddresses) {
        user.remoteAddresses = [req.ip]
        user.lastIP = req.ip
        await user.save()
      } else if (user.remoteAddresses.indexOf(req.ip) === -1) {
        user.remoteAddresses.push(req.ip)
        user.lastIP = req.ip
        await user.save()
      }
      req.user = user.toObject()
      next()
    } catch (e) {
      res.status(400).json(this.responseObj(e))
    }
  }

  // public hasPermissions(perm) {
  //   return function(req, res, next) {
  //     if (req.user.permissions & perm || req.user.permissions & Permissions.SUPER_ADMIN) return next()
  //     return res
  //       .status(403)
  //       .json(this.responseObj({ code: ERROR.InsufficientPrivilege, message: 'INSUFFICIENT_PRIVILEGE' }))
  //   }.bind(this)
  // }
}

export default new Util()
