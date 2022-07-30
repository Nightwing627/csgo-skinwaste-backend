const dotenv = require('dotenv')

dotenv.config()

module.exports = {
  app: {
    port: 8081,
  },
  domain: {
    frontend: process.env.FRONTEND_URL,
    backend: process.env.BACKEND_URL,
  },
  auth: {
    returnURL: `${process.env.AUTH_BACKEND_URL}/api/v1/auth/steam/callback`,
    realm: process.env.AUTH_BACKEND_URL,
    apiKey: 'BDE5C6CC8F6996E8A1AE44F65C391A4A',
  },
  mongo: {
    connectionString: process.env.DB_HOST,
  },
  socket: {
    transports: ['websocket'],
    origins: 'localhost:* staging.skinwaste.com:*',
    serveClient: false,
  },
  admin: {
    userId: '5f1fa52cd99872286cd5971e',
  },
  cryptoWallets: {
    btc: process.env.BTC_ADDRESS,
    eth: process.env.ETH_ADDRESS,
    ltc: process.env.LTC_ADDRESS,
    usdc: process.env.USDC_ADDRESS,
    usdt: process.env.USDT_ADDRESS,
  },
  coinRemitter: {
    apiKey: process.env.COINREMITTER_APIKEY,
    password: process.env.COINREMITTER_PASSWORD,
  },
  cryptoPriv: {
    btc: process.env.BTC_PRIV_KEY,
    eth: process.env.ETH_PRIV_KEY,
  },
  coinpayments: {
    ipnSecret: process.env.IPN_SECRET || 'test-secret',
  },
  coinmarketcap: {
    apiKey: process.env.COINMARKETCAP_APIKEY || 'ee6f5279-7fd8-4225-8990-b039a4a796f3d',
  },
  waxpeer: {
    apiKey: '740899cc7ecb0b13e00099113b93656b7c120a592b0d16decbe6521cffb4c3c2',
  },
  rustySell: {
    merchantId: process.env.RUSTYSELL_MERCHANT_ID,
    merchantSecret: process.env.RUSTYSELL_MERCHANT_SECRET,
  },
  skinsBack: {
    projectID: process.env.SKINSBACK_PROJECT_ID,
    projectSecret: process.env.SKINSBACK_PROJECT_SECRET,
  },
  discord: {
    botToken: process.env.DISCORD_BOT,
  },
  testing: {
    testAccountID: '5f2c15ee37d1883d6a94ce9b',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'testsecret',
    expiresIn: '14d',
    issuer: 'localhost:8003',
    audience: 'localhost:8000',
  },
  session: {
    cookie: {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60e3,
    },
    secret: 'hVFV9AmBNMLdQTr1//F+Af3iKVs/zbEiWbA5g7Yl8ac=',
    resave: false,
    rolling: true,
    saveUninitialized: true,
    unset: 'destroy',
    store: null,
  },
  logger: {
    level: 'all',
    appenders: {
      console: {
        type: 'console',
      },
      access: {
        type: 'dateFile',
        filename: 'log/access.log',
        pattern: '-yyyy-MM-dd',
        category: 'http',
      },
      app: {
        type: 'dateFile',
        filename: 'log/app.log',
        alwaysIncludePattern: true,
        keepFileExt: true,
      },
      errorFile: {
        type: 'file',
        filename: 'log/errors.log',
      },
      errors: {
        type: 'logLevelFilter',
        level: 'ERROR',
        appender: 'errorFile',
      },
    },
    categories: {
      default: {
        appenders: ['app', 'errors', 'console'],
        level: 'DEBUG',
      },
      http: {
        appenders: ['access'],
        level: 'DEBUG',
      },
    },
  },
  isAppProd: () => {
    return process.env.NODE_ENV === 'production'
  },
  isAppLocal: () => {
    return process.env.NODE_ENV === 'localhost'
  },
}
