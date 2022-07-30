import mongoose, { Schema, Document, PaginateModel, Types } from 'mongoose'
import { mongoosePagination } from 'ts-mongoose-pagination'

export interface IReward extends Document {
  createdAt: any
  reward: number
  userId: Types.ObjectId
  date: Date
}

const RewardSchema: Schema = new Schema(
  {
    reward: {
      type: Number,
      default: 0,
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    date: {
      type: Date,
      default: new Date(),
    },
  },
  { timestamps: true }
)

RewardSchema.plugin(mongoosePagination)

const Promo: PaginateModel<IReward> = mongoose.model('Reward', RewardSchema)

export default Promo
