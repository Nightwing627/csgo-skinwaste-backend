import mongoose, { Schema, Document, PaginateModel } from 'mongoose'
import { mongoosePagination } from 'ts-mongoose-pagination'
import Util from '../utils'

export enum EBanLevel {
  None = 0,
  Chat = 1,
  Withdraw = 2,
  Site = 3,
}

export enum EPermission {
  None = 0,
}

export interface IUser extends Document {
  _id: string
  steamID: string
  username: string
  avatar: string
  rank: number
  permissions: number
  steamTrade: {
    partner?: string
    token?: string
  }
  balance?: number
  banLevel?: number
  country: string
  lastIP: string
  cryptoAddresses?: {
    BTC?: string
    ETH?: string
  }
  addressUpdated?: {
    ETH?: {
      nonce: number
      dateUpdated: Date
    }
  }
  agreeChatRules: boolean
  affiliateUsedId: mongoose.Types.ObjectId
  affiliateLockTill: Date
  amountBeforeWithdrawal?: number
  wagered: number
  won: number
  deposited: number
  banExp: Date
  level?: number
  remoteAddresses: string[]
  onlineTime: object
  createdAt: Date
  updatedAt: Date
}

const UserSchema: Schema = new Schema(
  {
    steamID: String,
    username: String,
    avatar: String,
    steamTrade: {
      partner: Number,
      token: String,
    },
    balance: {
      type: Number,
      get: v => parseInt(v, 10),
      set: v => parseInt(v, 10),
      default: 0,
    },
    cryptoAddresses: {
      ETH: String,
      BTC: String,
    },
    addressUpdated: {
      default: {},
      type: Object,
    },
    lastIP: String,
    country: String,
    rank: {
      type: Number,
      default: 0,
    },
    permissions: {
      type: Number,
      default: 0,
    },
    banLevel: {
      type: Number,
      default: -1,
    },
    agreeChatRules: {
      type: Boolean,
      default: false,
    },
    banExp: Date,
    affiliateUsedId: {
      type: mongoose.Types.ObjectId,
      ref: 'Affiliate',
    },
    affiliateLockTill: Date,
    amountBeforeWithdrawal: { type: Number, get: v => parseInt(v, 10), set: v => parseInt(v, 10), default: 0 },
    wagered: {
      type: Number,
      get: v => parseInt(v, 10),
      set: v => parseInt(v, 10),
      default: 0,
    },
    won: {
      type: Number,
      get: v => parseInt(v, 10),
      set: v => parseInt(v, 10),
      default: 0,
    },
    deposited: {
      type: Number,
      get: v => parseInt(v, 10),
      set: v => parseInt(v, 10),
      default: 0,
    },
    remoteAddresses: [
      {
        type: String,
      },
    ],
  },
  { timestamps: true, minimize: false }
)

UserSchema.plugin(mongoosePagination)

const User: PaginateModel<IUser> = mongoose.model('User', UserSchema)

export default User

export const userDataToGameData = user => {
  const userData: IUser = user
  delete userData.balance
  delete userData.banLevel
  delete userData.agreeChatRules
  delete userData.steamTrade
  delete userData.createdAt
  delete userData.updatedAt
  delete userData.cryptoAddresses
  delete userData.__v
  delete userData.amountBeforeWithdrawal
  delete userData.banExp
  delete userData.affiliateUsedId
  delete userData.affiliateLockTill
  delete userData.deposited
  delete userData.remoteAddresses
  delete userData.lastIP
  delete userData.country
  delete userData.won
  delete userData.onlineTime
  delete userData.permissions

  userData.level = Util.getLevel(userData.wagered ? userData.wagered : 0)

  delete userData.wagered

  return userData
}
