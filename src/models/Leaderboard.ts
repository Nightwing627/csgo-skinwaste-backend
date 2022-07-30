import mongoose, { Schema, Document } from 'mongoose'

export interface ILeaderboardUser {
  user_id: string
  username: string
  avatar: string
  amount: number
  reward: number
}
export interface ILeaderboardI {
  date: Date
  week: string
  month: string
  confirmed: boolean
  users: ILeaderboardUser[] | any[]
}
export interface ILeaderboard extends Document, ILeaderboardI {}

const LeaderboardUserSchema = new Schema({
  user_id: String,
  username: String,
  avatar: String,
  amount: Number,
  reward: Number,
})

const LeaderboardSchema: Schema = new Schema(
  {
    date: Date,
    week: String,
    month: String,
    confirmed: Boolean,
    users: [LeaderboardUserSchema],
  },
  { versionKey: false, timestamps: true }
)

export default mongoose.model<ILeaderboard>('Leaderboard', LeaderboardSchema)
