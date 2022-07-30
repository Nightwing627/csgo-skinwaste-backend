import EventEmitter from 'events'
import request from 'request-promise'
import config from 'config'
import Logger from '../utils/Logger'
import Util from '../utils'
import ActionLogger from './ActionLogger'
import { ERROR } from '../constants/Errors'
import BadWords from 'bad-words'

export default class BaseService extends EventEmitter {
  Logger: any

  Config: any

  Request: any

  Util: any

  Error: any

  Filter: BadWords

  LogAction: any

  RaceIds: {}

  constructor({ location }) {
    super()
    this.Logger = new Logger(location).Logger
    this.Config = config
    this.Request = request.defaults({ json: true })
    this.Util = Util
    this.Error = ERROR
    this.Filter = new BadWords({ list: ['fagget'] })
    this.LogAction = ActionLogger

    this.RaceIds = {}
  }

  _raceInterval() {
    setInterval(() => {
      const time = Date.now()
      for (const [userId, lastTime] of Object.entries(this.RaceIds)) {
        const timeB: any = lastTime
        const space = time - timeB

        this.Logger.info(userId)

        if (space > 10e3) delete this.RaceIds[userId]
      }
    }, 10e3)
  }

  public isRace(userId, spacing) {
    if (this.RaceIds[userId]) {
      const space = Date.now() - this.RaceIds[userId]
      if (space < spacing) {
        return true
      }
    }

    this.RaceIds[userId] = Date.now()
    return false
  }
}
