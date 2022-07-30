import svgCaptcha from 'svg-captcha'
import CaptchaDB from '../models/Captcha'
import BaseService from './BaseService'

export default class Captcha extends BaseService {
  constructor() {
    super({ location: 'services/Captcha' })
  }
  public createCaptcha() {
    const captcha = svgCaptcha.create({ color: true, background: '#FEFEFE' })

    const captchaData = new CaptchaDB({
      svg: captcha.data,
      text: captcha.text,
    })
    captchaData.save()

    return { svg: captchaData.svg, _id: captchaData._id }
  }

  public async validateCaptcha(token: string, text: string) {
    const captcha = await CaptchaDB.findOne({ _id: token })

    if (!captcha) {
      return { erorr: 'Not Found' }
    }

    if (captcha.text !== text) {
      return { erorr: 'Wrong Answer' }
    }

    return { captcha: true }
  }
}
