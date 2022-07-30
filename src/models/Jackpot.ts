import mongoose, { Schema, Document } from 'mongoose'
import * as Increment from 'mongoose-plugin-autoinc'

export enum EJackpotState {
  Waiting = 'waiting',
  Active = 'active',
  BettingClosed = 'betting_closed',
  Rolling = 'rolling',
  Completed = 'complete',
}

export interface IJackpotWinner {
  userId: mongoose.Types.ObjectId
  amount: number
  totalBet: number
}

export interface IJackpot extends Document {
  _id: mongoose.Types.ObjectId
  roundID: number
  startTime?: Date
  endTime?: number
  state: EJackpotState
  pot?: number
  winnerId?: mongoose.Types.ObjectId
  winnerData?: object
  roll?: number
  percent?: number
  gameHash: string
  randomHash?: string
  randomJson?: string
  signature?: string
  unencodedServerHash: string
  secondsTillRoll?: number
  createdAt?: Date
  updatedAt?: Date
}

const JackpotSchema: Schema = new Schema(
  {
    startTime: Date,
    endTime: Number,
    state: {
      type: String,
      enum: [
        EJackpotState.Waiting,
        EJackpotState.Active,
        EJackpotState.BettingClosed,
        EJackpotState.Rolling,
        EJackpotState.Completed,
      ],
      default: EJackpotState.Waiting,
    },
    pot: {
      type: Number,
      default: 0,
    },
    winnerId: {
      type: mongoose.Types.ObjectId,
      ref: 'User',
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

JackpotSchema.plugin(Increment.plugin, { model: 'Jackpot', field: 'roundID' })

export default mongoose.model<IJackpot>('Jackpot', JackpotSchema)
