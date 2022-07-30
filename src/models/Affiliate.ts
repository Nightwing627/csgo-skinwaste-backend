import mongoose, { Schema, Document, PaginateModel } from 'mongoose'
import { mongoosePagination } from 'ts-mongoose-pagination'

export interface IAffiliate extends Document {
  user_id: mongoose.Types.ObjectId
  code: string
  level: number
  totalUsersReferred: number
  referralDeposits: number
  referralsWagered: number
  earnings: number
  balance: number
  levelOverride: boolean
  elite: boolean
}

const AffiliateSchema: Schema = new Schema(
  {
    user_id: {
      type: mongoose.Types.ObjectId,
      required: true,
    },
    code: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    level: {
      type: Number,
      default: 1,
    },
    totalUsersReferred: {
      type: Number,
      default: 0,
    },
    referralDeposits: {
      type: Number,
      default: 0,
    },
    referralsWagered: {
      type: Number,
      default: 0,
    },
    earnings: {
      type: Number,
      get: v => parseInt(v, 10),
      set: v => parseInt(v, 10),
      default: 0,
    },
    balance: {
      type: Number,
      get: v => parseInt(v, 10),
      set: v => parseInt(v, 10),
      default: 0,
    },
    levelOverride: {
      type: Boolean,
      default: false,
    },
    elite: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
)

AffiliateSchema.plugin(mongoosePagination)

const Affiliate: PaginateModel<IAffiliate> = mongoose.model('Affiliate', AffiliateSchema)

export default Affiliate
