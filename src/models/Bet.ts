import mongoose, { Schema, Document, PaginateModel } from 'mongoose'
import { mongoosePagination } from 'ts-mongoose-pagination'
import * as Increment from 'mongoose-plugin-autoinc'
import { IUser } from './User'

export enum EGameSelection {
  Jackpot = 'jackpot',
  Silver = 'silver',
  Coinflip = 'coinflip',
  Roulette = 'roulette',
  Catcher = 'catcher',
}

export interface IBets extends Document {
  betID: number
  amount: number
  game: mongoose.Types.ObjectId
  user: any | IUser
  gameType: EGameSelection
  items: any[]
  extra: {
    side?: string
    field?: any
    bets?: {
      [key: number]: number
    }
  }
}

const BetSchema: Schema = new Schema(
  {
    amount: {
      type: Number,
      get: v => parseInt(v, 10),
      set: v => parseInt(v, 10),
    },
    items: [],
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    game: {
      type: Schema.Types.ObjectId,
    },
    gameType: {
      type: String,
      enum: [
        EGameSelection.Coinflip,
        EGameSelection.Silver,
        EGameSelection.Jackpot,
        EGameSelection.Roulette,
        EGameSelection.Catcher,
      ],
    },
    extra: Object,
  },
  { versionKey: false, timestamps: true }
)

BetSchema.plugin(mongoosePagination)
BetSchema.plugin(Increment.plugin, { model: 'Bet', field: 'betID' })

const Bet: PaginateModel<IBets> = mongoose.model('Bet', BetSchema)

export default Bet
