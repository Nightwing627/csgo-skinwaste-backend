import mongoose, { Schema, Document } from 'mongoose'

export interface ICoinParty extends Document {
  balance: number
  date: Date
  isFinished: boolean
  initiator: string
  participants: Schema.Types.ObjectId[]
  transactions: Schema.Types.ObjectId[]
}

const CoinPartySchema: Schema = new Schema({
  balance: { type: Schema.Types.Number, default: 0 },
  date: { type: Schema.Types.Date, default: Date.now },
  isFinished: { type: Schema.Types.Boolean, default: false },
  initiator: { type: Schema.Types.String, default: '' },
  participants: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  transactions: [{ type: Schema.Types.ObjectId, ref: 'Transaction' }],
})

export default mongoose.model<ICoinParty>('CoinParty', CoinPartySchema)
