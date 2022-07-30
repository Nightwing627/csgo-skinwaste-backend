import mongoose, { Schema, Document } from 'mongoose'

export interface IItem extends Document {
  market_name: string
  color: string
  image: string
  weapon: string
  skin: string
  wear: string
  active: boolean
  price: number
}

const ItemSchema: Schema = new Schema(
  {
    market_name: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    image: String,
    color: String,
    weapon: {
      type: String,
      index: true,
    },
    skin: {
      type: String,
      index: true,
    },
    wear: String,
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    price: {
      type: Number,
      get: v => parseInt(v, 10),
      set: v => parseInt(v, 10),
    },
  },
  { versionKey: false, timestamps: true }
)

export default mongoose.model<IItem>('Item', ItemSchema)
