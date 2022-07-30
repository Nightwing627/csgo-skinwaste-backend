import mongoose, { Schema, Types, Document } from 'mongoose'

export enum EWaxPeerStatus {
  TradeSent = 4,
  TradeAccepted = 5,
  TradeDeclined = 6,
}

export interface IWax extends Document {
  waxPeerID: any
  waxPeerCostumID?: any
  status?: EWaxPeerStatus
  tradeMessage?: string
  itemID: Types.ObjectId
  userID: Types.ObjectId
  waxPeerValue: number
  valueCharged: number
}

const WaxSchema: Schema = new Schema(
  {
    waxPeerID: String,
    waxPeerCostumID: String,
    status: {
      type: Number,
      default: 0,
    },
    tradeMessage: String,
    userID: {
      type: mongoose.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    itemID: {
      type: mongoose.Types.ObjectId,
      ref: 'Item',
      required: true,
    },
    waxPeerValue: Number,
    valueCharged: Number,
  },
  { timestamps: true }
)

export default mongoose.model<IWax>('WaxTx', WaxSchema)
