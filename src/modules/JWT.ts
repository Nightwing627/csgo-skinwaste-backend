import jwt from 'jsonwebtoken'
import config from 'config'
import { ERROR } from '../constants/Errors'

interface IUserTokenData {
  id: string
}

const jwtConfig = config.get('jwt')

export default class JWT {
  public static createUserToken(data: IUserTokenData): Promise<string> {
    const options = JSON.parse(JSON.stringify(config.jwt))
    delete options.secret

    return jwt.sign({ data }, jwtConfig.secret, options)
  }

  public static async validateToken(token: string) {
    return new Promise((resolve, reject) => {
      jwt.verify(token, jwtConfig.secret, async (err, decoded) => {
        if (err) {
          return reject({ code: ERROR.InvalidToken, message: 'INVALID_TOKEN' })
        }

        return resolve(decoded)
      })
    })
  }
}
