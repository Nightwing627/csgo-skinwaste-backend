import config from 'config'

export default class Steam {
  url: string

  constructor() {
    this.url = `https://steamcommunity.com/openid/login?openid.mode=checkid_setup&openid.ns=http://specs.openid.net/auth/2.0&openid.identity=http://specs.openid.net/auth/2.0/identifier_select&openid.claimed_id=http://specs.openid.net/auth/2.0/identifier_select&openid.return_to=${config.auth.returnURL}&openid.realm=${config.auth.realm}`
  }

  public getAuthUrl() {
    return this.url
  }
}
