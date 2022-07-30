/* eslint-disable @typescript-eslint/no-unused-vars */
import Web3 from 'web3'
import qs from 'querystring'
import BaseService from './BaseService'
import config from 'config'
import { ERROR } from '../constants/Errors'
import crypto from 'crypto'
import { startSession } from 'mongoose'
import User, { EBanLevel } from '../models/User'
import Transaction, { ETransactionState, ETransactionType, ETransactionCurrency } from '../models/Transaction'
import Config from '../models/Config'
import Schedule from 'node-schedule'
import Discord from './Discord'
import { ObjectID } from 'mongodb'
import Affiliate from '../models/Affiliate'

const Tx = require('ethereumjs-tx').Transaction

const currencyLeastDecimal = {
  BTC: 10e-9,
  ETH: 10e-19,
  LTC: 10e-8,
  USDT: 3 * 10e-3,
  USDC: 3 * 10e-3,
}

const trc20List = ['usdt', 'usdc']

export default class Crypto extends BaseService {
  RequestCryptAPI: any
  RequestCoinEmitter: any
  RequestCoin: any
  web3: any
  Settings: any
  Discord: any

  depositWagerRate: any
  withdrawPercent: any
  ethNonce: number

  ipnUrl: string

  io: any

  constructor(io, { Settings }) {
    super({ location: 'services/Crypto' })
    this.web3 = new Web3('https://mainnet.infura.io/v3/0afe681664044ed18051293a486808cd')
    this.ipnUrl = `${config.domain.backend}/api/v1/payments/callback`
    this.io = io
    this.Settings = Settings
    this.Discord = new Discord({})
    this.depositWagerRate = 0
    this.ethNonce = 0

    this.RequestCryptAPI = this.Request.defaults({
      baseUrl: 'https://api.cryptapi.io',
    })

    this.RequestCoinEmitter = this.Request.defaults({
      baseUrl: 'https://coinremitter.com/api/v3',
    })

    this.RequestCoin = this.Request.defaults({
      baseUrl: 'https://pro-api.coinmarketcap.com/v1',
      headers: {
        'X-CMC_PRO_API_KEY': config.coinmarketcap.apiKey,
      },
    })

    this.Settings.on('crypto', data => {
      this.io.emit('config.crypto', data)
      this.withdrawPercent = data.withdrawPercent
    })

    this.Settings.on('site', data => {
      const { depositWageredPercent } = data.internal
      this.depositWagerRate = depositWageredPercent
    })

    this.startRecurringTasks()
    this._init()
  }

  private async _init() {
    try {
      const data = await this.Settings.getSiteSettings()
      const cryptData = await this.Settings.getCryptoSettings()
      this.depositWagerRate = data.internal.depositWageredPercent
      this.withdrawPercent = cryptData.withdrawPercent
      await this.updateRates()
      this.ethNonce = await this.web3.eth.getTransactionCount(config.cryptoWallets.eth)
      this.Logger.info(this.withdrawPercent)
    } catch (e) {
      this.Logger.error(e)
    }
  }

  private startRecurringTasks() {
    if (config.isAppProd())
      Schedule.scheduleJob('*/1 * * * *', async () => {
        this.Logger.info('Updating Crpyto Rates')
        await this.updateRates()
      })
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async getWalletBalances(pure = false) {
    try {
      const balances = { total: 0 }
      const { rates } = await this.Settings.getCryptoSettings(false)

      return balances
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR', errors: e.message })
    }
  }

  public async updateRates() {
    try {
      const { allowedCoins } = await this.Settings.getCryptoSettings()
      const buildData = {}

      const data = await Promise.all(
        allowedCoins.map(coin => {
          const coinUrl = this.getCoinUrl(coin.toLowerCase())

          return this.RequestCryptAPI.get(`/${coinUrl}/info`).then(res => ({ ...res, coin }))
        })
      )

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      Object.entries(data).forEach(async ([key, entry]: any) => {
        try {
          const { coin } = entry
          const price = parseInt((parseFloat(entry.prices.USD) * 100).toFixed(2), 10)
          const depositRate = this.getDepositRate(coin.toLowerCase())
          const withdrawRate = this.getWithdrawRate(coin.toLowerCase())
          const deposit = (price - price * depositRate).toFixed(2)
          const withdraw = (price * withdrawRate).toFixed(2)
          const minTx = entry.minimum_transaction * currencyLeastDecimal[coin] ?? 0
          this.Logger.info(deposit, withdraw)
          await Config.findOneAndUpdate(
            { feature: 'crypto' },
            {
              [`settings.rates.${coin}.deposit`]: parseInt(deposit, 10),
              [`settings.rates.${coin}.withdrawal`]: parseInt(withdraw, 10),
              [`settings.rates.${coin}.normal`]: price,
              [`settings.minDepositValues.${coin}`]: minTx,
            }
          )
          buildData[coin] = parseFloat(entry.prices.USD).toFixed(2)
        } catch (e) {
          this.Logger.error(e)
        }
      })

      this.io.emit('config.crypto', await this.Settings.getCryptoSettings())

      return buildData
    } catch (e) {
      this.Logger.error(e)
    }
  }

  public async getEthGasPrice(to, value) {
    try {
      const gasPrice = await this.web3.eth.getGasPrice()
      const gasPriceLimit = await this.web3.eth.estimateGas({
        to,
        value: this.web3.utils.toHex(this.web3.utils.toWei(`${value}`, 'ether')),
      })

      const ethPrice = (gasPrice / 1e9) * gasPriceLimit

      const { rates } = await this.Settings.getCryptoSettings(false)

      const fiat_amount: any = (((ethPrice / 1e9) * rates.ETH.normal) / 100).toFixed(0)

      // this.Logger.debug(`
      // gasPrice: ${gasPrice}
      // gasPriceLimit: ${gasPriceLimit}
      // ethPrice: ${ethPrice}
      // rates.ETH.normal: ${rates.ETH.normal}
      // fiat_amount: ${fiat_amount}
      // `)

      return fiat_amount
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async createETHWithdrawal(address, amount) {
    try {
      let nonce = await this.web3.eth.getTransactionCount(config.cryptoWallets.eth, 'pending')
      if (nonce < this.ethNonce) {
        nonce = this.ethNonce + 1
        this.ethNonce++
      }

      const gasPrice = await this.web3.eth.getGasPrice()
      const gasPriceLimit = await this.web3.eth.estimateGas({
        nonce,
        to: address,
        value: this.web3.utils.toHex(this.web3.utils.toWei(amount, 'ether')),
      })

      const txObj = {
        nonce,
        to: address,
        value: this.web3.utils.toHex(this.web3.utils.toWei(amount, 'ether')),
        gasLimit: this.web3.utils.toHex(gasPriceLimit),
        gasPrice: this.web3.utils.toHex(gasPrice),
      }

      this.Logger.debug('txObj', txObj)

      const tx = new Tx(txObj)

      tx.sign(Buffer.from(config.cryptoPriv.eth, 'hex'))

      const serializedTransaction = tx.serialize()
      const raw = '0x' + serializedTransaction.toString('hex')

      const ethTrans = this.web3.eth.sendSignedTransaction(raw)

      return new Promise(resolve => {
        ethTrans.on('transactionHash', hash => resolve(hash))
      })
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async createLTCWithdrawal(address, amount) {
    try {
      const validateAddressResponse = await this.RequestCoinEmitter.post('LTC/validate-address', {
        body: {
          api_key: config.coinRemitter.apiKey,
          password: config.coinRemitter.password,
          address,
        },
      })

      if (!validateAddressResponse.data.valid)
        return Promise.reject({ code: ERROR.InvalidWalletAddress, message: 'INVALID_WALLET_ADDRESS' })

      const withdrawResponse = await this.RequestCoinEmitter.post('LTC/withdraw', {
        body: {
          api_key: config.coinRemitter.apiKey,
          password: config.coinRemitter.password,
          address,
          amount,
        },
      })

      return withdrawResponse.txid
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async createWithdrawRequest(userID, address, amount, currency, pending = false, txId?: ObjectID) {
    try {
      const user = await User.findById(userID).lean()

      if ([EBanLevel.Withdraw, EBanLevel.Site].includes(user.banLevel))
        return Promise.reject({ code: ERROR.Banned, message: 'USER_BANNED' })

      const { rates, allowedCoins } = await this.Settings.getCryptoSettings(false)

      if (allowedCoins.indexOf(currency.toUpperCase()) === -1)
        return Promise.reject({ code: ERROR.InvalidParams, message: 'INVALID_COIN' })

      const cryptoAmount: any = (amount / rates[currency.toUpperCase()].withdrawal).toFixed(8)
      const fiat_amount: any = (cryptoAmount * rates[currency.toUpperCase()].normal).toFixed(0)

      let txHash = null

      switch (currency) {
        case 'eth':
          txHash = await this.createETHWithdrawal(address, cryptoAmount)
          break
        case 'btc':
          txHash = 'NO_BTC'
          break
        case 'ltc':
          txHash = await this.createLTCWithdrawal(address, cryptoAmount)
          break
        default:
          break
      }

      if (!txHash) return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })

      if (!pending) {
        await new Transaction({
          to_user_id: userID,
          amount,
          type: ETransactionType.Withdraw,
          status: ETransactionState.Confirmed,
          currency: currency.toUpperCase(),
          foreign_trx_id: txHash,
        }).save()
      } else {
        const tx = await Transaction.findByIdAndUpdate(txId, {
          foreign_trx_id: txHash,
          status: ETransactionState.Confirmed,
        })
        this.io.to(userID).emit('payments.completeWithdrawal', tx.toObject())
      }

      await new Transaction({
        to_user_id: config.admin.userId,
        amount: amount - fiat_amount,
        type: ETransactionType.CryptoProfit,
        status: ETransactionState.Confirmed,
        currency: ETransactionCurrency.Null,
      }).save()

      this.Discord.Notification('Withdraw', '', 'Withdrawal', [
        {
          name: 'UserID',
          value: userID,
        },
        {
          name: 'Username',
          value: user.username,
        },
        {
          name: 'Currency',
          value: currency.toUpperCase(),
        },
        {
          name: 'Amount USD',
          value: `$${(amount / 100).toFixed(2)}`,
        },
        {
          name: `Amount ${currency.toUpperCase()}`,
          value: cryptoAmount,
        },
        {
          name: 'Network TX Hash',
          value: txHash,
        },
        {
          name: 'Profit',
          value: `$${((parseInt(amount, 10) - parseInt(fiat_amount, 10)) / 100).toFixed(2)}`,
        },
      ])
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public generateIPNUrl(userID, nonce) {
    return this.ipnUrl + `?userID=${userID}&nonce=${nonce}&secret=${config.coinpayments.ipnSecret}&type=deposit`
  }

  public async getCallbackAddress(userID, currency, nonce) {
    const confirmations = {
      eth: 3,
      btc: 1,
      ltc: 6,
      usdt: 10,
      usdc: 10,
    }

    this.Logger.debug(this.generateIPNUrl(userID, nonce))

    const coinUrl = this.getCoinUrl(currency.toLowerCase())

    try {
      const data = await this.RequestCryptAPI.get(`/${coinUrl}/create`, {
        qs: {
          callback: this.generateIPNUrl(userID, nonce),
          address: config.cryptoWallets[currency.toLowerCase()],
          confirmations: confirmations[currency.toLowerCase()],
          pending: 1,
        },
      })

      this.Logger.info(data)

      return { address: data.address_in }
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async verifyIPN(hmac, payload) {
    const paramString = qs.stringify(payload).replace(/%20/g, `+`)
    const calcHmac = crypto
      .createHmac('sha512', config.coinpayments.ipnSecret)
      .update(paramString)
      .digest('hex')
    if (hmac !== calcHmac) return false
    return true
  }

  public async getLogs(userId, currency, nonce) {
    try {
      const coinUrl = this.getCoinUrl(currency.toLowerCase())

      return await this.RequestCryptAPI.get(`/${coinUrl}/logs`, {
        qs: { callback: this.generateIPNUrl(userId, nonce) },
      })
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async processDepositIPN(payload) {
    const { address_in, secret, txid_in, value_coin, value_forwarded_coin, pending, userID } = payload
    let { coin } = payload

    this.Logger.info(userID, secret)

    if (config.coinpayments.ipnSecret !== secret)
      return Promise.reject({ code: ERROR.InvalidParams, message: 'INVALID_PARAMS' })

    const { rates } = await this.Settings.getCryptoSettings(false)
    const { referralDepositBonus } = await this.Settings.getAffiliateSettings()

    if (coin.split('_').length > 1) {
      const [network, name] = coin.split('_')
      coin = name
    }

    const fiat_amount = parseInt((parseFloat(value_forwarded_coin) * rates[coin.toUpperCase()].deposit).toFixed(0), 10)

    const fiat_amount_real = parseInt(
      (parseFloat(value_forwarded_coin) * rates[coin.toUpperCase()].normal).toFixed(0),
      10
    )

    let bonus = 0

    const session = await startSession()
    session.startTransaction()

    try {
      const checkTx = await Transaction.findOne({ foreign_trx_id: txid_in, status: ETransactionState.Confirmed }).lean()

      if (checkTx) return

      const user = await User.findById(userID)

      if (!user) {
        this.Logger.error(`User ${userID} not found using ${coin.toUpperCase()} address: ${address_in}`)
        return Promise.reject({ code: ERROR.UserNotFound, message: 'USER_NOT_FOUND' })
      }

      if (user.affiliateUsedId) {
        bonus = parseInt((fiat_amount * parseFloat(referralDepositBonus)).toFixed(0), 10)
        await this.addAffiliateBonus(user.affiliateUsedId, bonus)
      }

      const needToWager = fiat_amount * this.depositWagerRate
      const total = fiat_amount + bonus

      if (pending === '1') {
        const tx = await new Transaction({
          to_user_id: user._id,
          currency: coin.toUpperCase(),
          type: ETransactionType.Deposit,
          status: ETransactionState.Pending,
          foreign_trx_id: txid_in,
          extra: {
            coin_value: value_coin,
            deposit: rates[coin.toUpperCase()].deposit,
            normal: rates[coin.toUpperCase()].normal,
          },
        }).save()

        delete tx.extra

        this.io.to(user._id).emit('payments.pendingDeposit', tx.toObject())
        return
      }

      user.balance += total
      if (user.deposited) user.deposited += total
      else user.deposited = total

      if (user.amountBeforeWithdrawal) {
        user.amountBeforeWithdrawal += needToWager
      } else {
        user.amountBeforeWithdrawal = needToWager
      }
      await user.save({ session })

      const userTx = await Transaction.findOneAndUpdate(
        { foreign_trx_id: txid_in, to_user_id: user._id },
        { status: ETransactionState.Confirmed, 'extra.coin_value_after_fees': value_forwarded_coin, amount: total },
        { session, new: true }
      ).lean()

      const tx = await new Transaction({
        to_user_id: config.admin.userId,
        amount: fiat_amount_real - fiat_amount,
        type: ETransactionType.CryptoProfit,
        status: ETransactionState.Confirmed,
        currency: ETransactionCurrency.Null,
      }).save()

      await session.commitTransaction()
      session.endSession()

      delete tx.extra
      this.io.to(user._id).emit('payments.completeDeposit', userTx)

      this.Discord.Notification('Deposit', 'YOLO', 'Deposit', [
        {
          name: 'UserID',
          value: user._id,
        },
        {
          name: 'Username',
          value: user.username,
        },
        {
          name: 'Currency',
          value: coin.toUpperCase(),
        },
        {
          name: 'Amount',
          value: `(Deposited) ${(fiat_amount / 100).toFixed(2)} + (Bonus) ${(bonus / 100).toFixed(2)} = ${(
            total / 100
          ).toFixed(2)}`,
        },
        {
          name: 'Profit',
          value: `$${((fiat_amount_real - fiat_amount) / 100).toFixed(2)}`,
        },
      ])
    } catch (e) {
      this.Logger.error(e)
      await session.abortTransaction()
      session.endSession()
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public getCoinUrl(coin) {
    const coinUrl = trc20List.includes(coin) ? `trc20/${coin}` : `${coin}`
    return coinUrl
  }

  public getDepositRate(coin) {
    coin = trc20List.includes(coin) ? 'trc20' : coin
    const rates = {
      btc: 0.06,
      eth: 0.04,
      ltc: 0.01,
      trc20: 0.01,
    }

    return rates[coin]
  }

  public getWithdrawRate(coin) {
    coin = trc20List.includes(coin) ? 'trc20' : coin
    const rates = {
      btc: 1.05,
      eth: 1.03,
      ltc: 1.02,
      trc20: 1.05,
    }

    return rates[coin]
  }

  private async addAffiliateBonus(affiliateId, bonus) {
    try {
      const affiliate = await Affiliate.findOne({ user_id: affiliateId })

      if (!affiliate) return 0

      const user = await User.findById(affiliate.user_id).lean()

      if (!user) {
        this.Logger.error('AFFILIATE USER NOT FOUND', affiliate.user_id)
        return 0
      }

      if (user?.banLevel === EBanLevel.Site) return 0

      await new Transaction({
        to_user_id: affiliate.user_id,
        amount: bonus,
        currency: ETransactionCurrency.Balance,
        type: ETransactionType.AffiliateEliteDeposit,
        status: ETransactionState.Confirmed,
        extra: {
          affiliateId,
        },
      }).save()

      affiliate.earnings += bonus
      affiliate.balance += bonus
      await affiliate.save()
    } catch (e) {
      this.Logger.error(e)
    }
  }
}
