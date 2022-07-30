import BaseService from './BaseService'
import Chance from 'chance'

export default class Provably extends BaseService {
  constructor() {
    super({ location: 'service/Provably' })
  }

  public generateServerSeed = (clientSeed: string | null = null): string => {
    let server_seed: string = this.Util.getRandomString(24)
    if (clientSeed) server_seed += `@${clientSeed}`
    // else server_seed += `@${this.Util.getRandomString(12)}`;

    return server_seed
  }

  async retrieveRandomHashv2(n, gameHash) {
    try {
      const resp = await this.Request.post('https://api.random.org/json-rpc/2/invoke', {
        body: {
          jsonrpc: '2.0',
          method: 'generateSignedStrings',
          params: {
            apiKey: this.Config.random.apiKey,
            n,
            length: 20,
            characters: 'abcdefghijklmnopqrstuvwxyz0123456789',
            replacement: false,
            userData: gameHash,
          },
          id: 'skinwager',
        },
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
      })

      return resp.result
    } catch (e) {
      this.Logger.error(e)
      Promise.reject({ code: this.Error.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  async retrieveRandomHash(n) {
    try {
      const resp = await this.Request.post('https://api.random.org/json-rpc/1/invoke', {
        body: {
          jsonrpc: '2.0',
          method: 'generateSignedStrings',
          params: {
            apiKey: this.Config.random.apiKey,
            n,
            length: 20,
            characters: 'abcdefghijklmnopqrstuvwxyz0123456789',
            replacement: false,
          },
          id: 'skinwager',
        },
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
      })

      return resp.result
    } catch (e) {
      this.Logger.error(e)
      Promise.reject({ code: this.Error.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public getJackpotPercent = async (server_seed: string, pot_sum: number) => {
    try {
      let randomHash = this.Util.getRandomString(12)
      let signature = null
      let random = null

      if (this.Config.isAppProd()) {
        const randomData = await this.retrieveRandomHash(1)
        // eslint-disable-next-line prefer-destructuring
        randomHash = randomData.random.data[0]
        signature = randomData.signature
        random = JSON.stringify(randomData.random)
      }

      const chanceHash = `${server_seed}-${randomHash}`
      const percentage = new Chance(chanceHash).floating({ min: 0, max: 100, fixed: 6 }) / 100
      const ticket = pot_sum * percentage

      this.Logger.info(server_seed, pot_sum, chanceHash, percentage, ticket)

      return { ticket, percentage, signature, random, randomHash }
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: this.Error.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  public async getCatchResult(server_seed) {
    try {
      let randomHash = this.Util.getRandomString(12)
      let signature = null
      let random = null

      if (this.Config.isAppProd()) {
        const randomData = await this.retrieveRandomHashv2(1, server_seed)
        // eslint-disable-next-line prefer-destructuring
        randomHash = randomData.random.data[0]
        signature = randomData.signature
        random = JSON.stringify(randomData.random)
      }

      const hash = `${server_seed}-${randomHash}`
      const result = new Chance(hash).integer({ min: 0, max: 53 })

      return { result, hash, signature, random, randomHash }
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: this.Error.InternalError, message: 'INTERNAL_ERROR_CATCHER_PROVABLY' })
    }
  }

  public getCatcherBonusRound(hash) {
    const newHash = this.Util.genGameHash(hash)
    return { result: new Chance(newHash).integer({ min: 0, max: 53 }), hash: newHash }
  }

  public async getRouletteWinningField(server_seed: string) {
    this.Logger.info('test')
    try {
      let randomHash = this.Util.getRandomString(12)
      let signature = null
      let random = null

      if (this.Config.isAppProd()) {
        const randomData = await this.retrieveRandomHash(1)
        // eslint-disable-next-line prefer-destructuring
        randomHash = randomData.random.data[0]
        signature = randomData.signature
        random = JSON.stringify(randomData.random)
      }

      const hash = `${server_seed}-${randomHash}`
      const result = parseInt(hash.substr(0, 52 / 4), 16) % 32
      let roll = null
      if (result === 0) {
        roll = 'gold'
      } else if (result <= 6) {
        roll = 'pink'
      } else if (result <= 16) {
        roll = 'purple'
      } else if (result <= 31) {
        roll = 'black'
      }

      this.Logger.info(server_seed, hash, roll)

      return { roll, signature, random, randomHash }
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: this.Error.InternalError, message: 'INTERNAL_ERROR' })
    }
  }
}
