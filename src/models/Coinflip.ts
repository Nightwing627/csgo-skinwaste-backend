import mongoose, { Document, Schema } from 'mongoose'
import * as autoInc from 'mongoose-plugin-autoinc'

export enum ECoinflipState {
  Waiting = 0,
  Flipping = 1,
  Complete = 2,
  Paid = 3,
  Expired = 4,
  Cancelled = 5,
}

export interface ICoinflip extends Document {
  _id: mongoose.Types.ObjectId
  roundID: number
  startTime?: Date
  endTime?: number
  state: ECoinflipState
  pot?: number
  winnerId?: mongoose.Types.ObjectId
  t: any
  ct: any
  range: {
    high: number
    low: number
  }
  createdBy: mongoose.Types.ObjectId
  roll?: number
  percent?: number
  gameHash: string
  randomHash?: string
  randomJson?: string
  signature?: string
  unencodedServerHash: string
  createdAt?: Date
  updatedAt?: Date
  winner?: any
}

const CoinflipSchema: Schema = new Schema(
  {
    startTime: Date,
    endTime: Number,
    state: {
      type: Number,
      enum: [
        ECoinflipState.Waiting,
        ECoinflipState.Flipping,
        ECoinflipState.Complete,
        ECoinflipState.Paid,
        ECoinflipState.Expired,
        ECoinflipState.Cancelled,
      ],
      default: ECoinflipState.Waiting,
    },
    pot: {
      type: Number,
      default: 0,
    },
    winnerId: {
      type: mongoose.Types.ObjectId,
      ref: 'User',
    },
    ct: {
      type: mongoose.Types.ObjectId,
      ref: 'Bet',
    },
    t: {
      type: mongoose.Types.ObjectId,
      ref: 'Bet',
    },
    createdBy: {
      type: mongoose.Types.ObjectId,
      ref: 'User',
    },
    range: {
      low: Number,
      high: Number,
    },
    roll: Number,
    percent: Number,
    gameHash: String,
    randomHash: String,
    randomJson: String,
    signature: String,
    unencodedServerHash: String,
  },
  { versionKey: false, timestamps: true }
)

CoinflipSchema.plugin(autoInc.plugin, { model: 'Coinflip', field: 'roundID' })

export default mongoose.model<ICoinflip>('Coinflip', CoinflipSchema)
