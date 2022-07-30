import mongoose, { Schema, Document } from 'mongoose'

export interface IRustySellOrder extends Document {
  _id: string | Schema.Types.ObjectId
  user_id: string | Schema.Types.ObjectId
  order_id: string
  creation_time?: string
  status?: string
  value?: number
  dateoffer_time?: string
  message?: string
  createdAt?: Date
  updatedAt?: Date
}

const RustySellOrderSchema: Schema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    order_id: {
      type: String,
      required: true,
    },
    creation_time: {
      type: String,
    },
    status: {
      type: String,
      default: 'created',
    },
    value: {
      type: Number,
      default: 0,
    },
    dateoffer_time: {
      type: String,
    },
    message: {
      type: String,
    },
  },
  { versionKey: false, timestamps: true }
)

export default mongoose.model<IRustySellOrder>('RustySellOrder', RustySellOrderSchema)
