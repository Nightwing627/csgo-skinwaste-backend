import mongoose from 'mongoose'
import config from 'config'
import Log from './Logger'

const { Logger } = new Log('DATABASE/INIT')

export default class DB {
  mongoose: any

  session: any

  constructor(session) {
    this.session = session
    this.mongoose = mongoose
  }

  connect() {
    const MongoStore = require('connect-mongo')(this.session)
    this.mongoose.connect(
      config.mongo.connectionString,
      {
        useUnifiedTopology: true,
        connectTimeoutMS: 10000,
        keepAlive: true,
        keepAliveInitialDelay: 300000,
        autoIndex: true,
        useNewUrlParser: true,
      },
      err => {
        if (err) return Logger.error(err)
        Logger.info('DB Connected')
      }
    )

    return new MongoStore({ mongooseConnection: this.mongoose.connection, stringify: false })
  }
}
