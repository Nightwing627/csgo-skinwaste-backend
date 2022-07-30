import * as dotenv from 'dotenv'
import express from 'express'
import path from 'path'
import bodyParser from 'body-parser'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import session from 'express-session'
import passport from 'passport'
import DB from './utils/DB'
import LoggerModule from './utils/Logger'
import config from 'config'
import ModulesFactory from './modules'
import RoutesFactory from './routes'
import Helmet from 'helmet'

dotenv.config()

const { Logger } = new LoggerModule('src/Server')

const allowedOrigins = ['http://localhost:8080', 'http://localhost:3000', 'https://staging.skinwaste.com']

const corsOptions = {
  origin: (origin: any, callback: any) => {
    if (!origin) return callback(null, true)
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.'
      return callback(new Error(msg), false)
    }
    return callback(null, true)
  },
  credentials: true,
}

const app = express()
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')
app.set('trust proxy', true)
app.use(Helmet())
const io = require('socket.io')(app.listen(config.app.port), JSON.parse(JSON.stringify(config.socket)))
Logger.info(`Server started on port: ${config.app.port}`)

const sessionOptions = JSON.parse(JSON.stringify(config.session))
sessionOptions.store = new DB(session).connect()

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(cors(corsOptions))
app.use(session(sessionOptions))
app.use(passport.initialize())
app.use(passport.session())

require('./modules/Steam-Passport')(passport)

const Services = ModulesFactory(io)

require('./modules/Socket')(io, Services)

app.use('/api', RoutesFactory({ ...Services, ...{ passport } }))

app.get('*', (req, res) => {
  res.json({ alive: true })
})
