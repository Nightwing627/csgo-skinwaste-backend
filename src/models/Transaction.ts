import mongoose, { Schema, Document, PaginateModel } from 'mongoose'
import { mongoosePagination } from 'ts-mongoose-pagination'

export enum ETransactionState {
  New = 0,
  Pending = 1,
  Confirmed = 2,
  Cancelled = 3,
  Declined = 4,
}

export enum ETransactionCurrency {
  Null = 'null',
  BTC = 'BTC',
  ETH = 'ETH',
  LTC = 'LTC',
  USDT = 'USDT',
  USDC = 'USDC',
  Skins = 'skins',
  Balance = 'balance',
  RustySell = 'rustySell',
  SkinsBack = 'skinsBack',
}

export enum ETransactionType {
  Withdraw = 0,
  Deposit = 1,
  Jackpot = 2,
  Coinflip = 3,
  Winnings = 4,
  Sponsor = 5,
  Cashout = 6,
  Operations = 7,
  ItemPurchase = 8,
  ItemSale = 9,
  AffiliateDeposit = 10,
  AffiliateWithdrawal = 11,
  Giveaway = 12,
  Rake = 13,
  AffiliateEliteDeposit = 14,
  Tip = 15,
  CSGOProfit = 16,
  CSGOPurchase = 17,
  CSGORefund = 18,
  CryptoProfit = 19,
  Roulette = 20,
  Catcher = 21,
  EditUserBalance = 21,
  LeaderboardRewards = 22,
  CoinPartyRewards = 23,
  Reward = 24,
}

export interface ITransaction extends Document {
  to_user_id: mongoose.Types.ObjectId
  from_user_id?: mongoose.Types.ObjectId
  skins?: mongoose.Types.ObjectId[]
  csgoSkins: mongoose.Types.ObjectId[]
  amount: number
  currency: ETransactionCurrency
  type: ETransactionType
  status: ETransactionState
  foreign_trx_id?: string
  extra: object
}

const TransactionSchema: Schema = new Schema(
  {
    to_user_id: {
      type: mongoose.Types.ObjectId,
      required: true,
    },
    from_user_id: {
      type: mongoose.Types.ObjectId,
    },
    skins: [
      {
        type: mongoose.Types.ObjectId,
        ref: 'Backpack',
      },
    ],
    csgoSkins: [
      {
        type: mongoose.Types.ObjectId,
        ref: 'Item',
      },
    ],
    amount: {
      type: Number,
      get: v => parseInt(v, 10),
      set: v => parseInt(v, 10),
      default: 0,
    },
    currency: {
      type: String,
      default: ETransactionCurrency.Null,
      enum: ['null', 'BTC', 'ETH', 'LTC', 'USDT', 'USDC', 'skins', 'balance', 'rustySell', 'skinsBack'],
    },
    type: {
      type: Number,
      required: true,
      enum: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
    },
    status: {
      type: Number,
      required: true,
      default: ETransactionState.New,
      enum: [0, 1, 2, 3, 4],
    },
    foreign_trx_id: {
      type: String,
    },
    extra: Object,
  },
  { versionKey: false, timestamps: true }
)

TransactionSchema.plugin(mongoosePagination)

const Transaction: PaginateModel<ITransaction> = mongoose.model('Transaction', TransactionSchema)

export default Transaction
