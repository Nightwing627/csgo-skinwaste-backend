import mongoose, { Schema, Document } from 'mongoose'

export interface IAction extends Document {
  _id: string | Schema.Types.ObjectId
  user_id: string | Schema.Types.ObjectId
  action: string
  data: object
  ip: string
  createdAt?: Date
  updatedAt?: Date
}

const ActionSchema: Schema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    action: {
      type: String,
      required: true,
    },
    ip: String,
    data: Object,
  },
  { versionKey: false, timestamps: true }
)

export default mongoose.model<IAction>('Action', ActionSchema)
