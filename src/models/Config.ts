import mongoose, { Schema, Document } from 'mongoose'

export interface IConfig extends Document {
  feature: string
  settings: any
  updatedAt?: any
}

const ConfigSchema: Schema = new Schema(
  {
    feature: String,
    settings: Object,
  },
  { versionKey: false, timestamps: true }
)

export default mongoose.model<IConfig>('Config', ConfigSchema)
