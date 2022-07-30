import mongoose, { Schema, Document } from 'mongoose'

export interface ISkinsBackOrder extends Document {
  _id: string | Schema.Types.ObjectId
  user_id: string | Schema.Types.ObjectId
  status?: string
  url?: string
  transactions_id?: number
  amount?: number // only success | The amount that the user deposited in the currency 'currency'.
  amount_currency?: string // only success | The currency that the user deposited.
  amount_in_currencies?: object // only success | Refill amount in all available currencies.
  user_amount?: number // only success | The amount that the user deposited multiplied by the value from the project settings
  user_amount_in_currencies?: object // only success | The amount that the user deposited multiplied by the value from the project settings in all available currencies.
  offer_date?: number
  skins_send_data?: number
  skins?: any // only success | An array that contains information about the received skins: name, price, and price with a multiplier.
  createdAt?: Date
  updatedAt?: Date
}

const SkinsBackOrderSchema: Schema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      default: 'created',
    },
    url: {
      type: String,
      default: '',
    },
    transactions_id: {
      type: Number,
      default: 0,
    },
    amount: {
      type: Number,
      default: 0,
    },
    amount_currency: {
      type: String,
    },
    amount_in_currencies: {
      type: Object,
    },
    user_amount: {
      type: Number,
    },
    user_amount_in_currencies: {
      type: Object,
    },
    offer_date: {
      type: Number,
    },
    skins_send_data: {
      type: Number,
    },
    skins: {
      type: Object,
    },
  },
  { versionKey: false, timestamps: true }
)

export default mongoose.model<ISkinsBackOrder>('SkinsBackOrder', SkinsBackOrderSchema)
