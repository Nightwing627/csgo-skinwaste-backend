import mongoose, { Schema, Document } from 'mongoose'

export interface IChatMessage extends Document {
  message: string
  announcement: boolean
  date: Date
  room: string
  deleted: boolean
  user: {
    user_id: string
    username: string
    steamid: string
    avatar: string
    rank: number
    level: number
  }
}

const ChatMessageSchema: Schema = new Schema(
  {
    message: String,
    announcement: Boolean,
    date: Date,
    room: String,
    deleted: Boolean,
    user: {
      user_id: String,
      username: String,
      steamid: String,
      avatar: String,
      rank: Number,
      level: Number,
    },
  },
  { versionKey: false, timestamps: true }
)

export default mongoose.model<IChatMessage>('ChatMessage', ChatMessageSchema)
