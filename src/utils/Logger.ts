import { configure, getLogger } from 'log4js'
import config from 'config'

class Log {
  public Logger: any

  constructor(source: string) {
    const loggerConfig = config.get('logger')
    configure(loggerConfig)
    this.Logger = getLogger(source)

    this.Logger.level = loggerConfig.level
  }
}

export default Log
