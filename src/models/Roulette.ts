import mongoose, { Schema, Document } from 'mongoose'
import * as Increment from 'mongoose-plugin-autoinc'

export enum ERouletteState {
  Active = 'active',
  BettingClosed = 'betting_closed',
  Rolling = 'rolling',
  Completed = 'complete',
}

export interface IRoulette extends Document {
  _id: mongoose.Types.ObjectId
  roundID: number
  startTime: Date
  endTime?: number
  state: ERouletteState
  pot: number
  winnerId?: mongoose.Types.ObjectId
  secondsTillRoll?: number
  roll?: string
  gameHash: string
  randomHash?: string
  randomJson?: string
  signature?: string
  unencodedServerHash: string
  createdAt: Date
  updatedAt: Date
}

const RouletteSchema: Schema = new Schema(
  {
    startTime: Date,
    endTime: Number,
    state: {
      type: String,
      enum: [ERouletteState.Active, ERouletteState.BettingClosed, ERouletteState.Rolling, ERouletteState.Completed],
      default: ERouletteState.Active,
    },
    pot: {
      type: Number,
      default: 0,
    },
    winnerId: {
      type: mongoose.Types.ObjectId,
      ref: 'User',
    },
    roll: String,
    gameHash: String,
    randomHash: String,
    randomJson: String,
    signature: String,
    unencodedServerHash: String,
  },
  { versionKey: false, timestamps: true }
)

RouletteSchema.plugin(Increment.plugin, { model: 'Roulette', field: 'roundID' })

export default mongoose.model<IRoulette>('Roulette', RouletteSchema)
