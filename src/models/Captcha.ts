import mongoose, { Schema, Document } from 'mongoose'

export interface ICaptcha extends Document {
  svg: string
  text: string
}

const CaptchaSchema: Schema = new Schema({
  svg: String,
  text: String,
})

export default mongoose.model<ICaptcha>('Captcha', CaptchaSchema)
