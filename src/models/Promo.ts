import mongoose, { Schema, Document, PaginateModel } from 'mongoose'
import { mongoosePagination } from 'ts-mongoose-pagination'

export interface IPromo extends Document {
  code: string
  reward: number
  maxUse: number
  users: Array<string>
  active: boolean
}

const PromoSchema: Schema = new Schema(
  {
    code: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    reward: {
      type: Number,
      required: true,
    },
    maxUse: {
      type: Number,
      default: -1,
    },
    users: {
      type: Array,
      default: [],
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
)

PromoSchema.plugin(mongoosePagination)

const Promo: PaginateModel<IPromo> = mongoose.model('Promo', PromoSchema)

export default Promo
