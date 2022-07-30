import mongoose, { Schema, Document } from 'mongoose'

export interface IBackpack extends Document {
  user_id: mongoose.Types.ObjectId
  item_id: mongoose.Types.ObjectId | any
  sold?: boolean
  deleted?: boolean
}

const BackpackSchema: Schema = new Schema(
  {
    user_id: {
      type: mongoose.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    item_id: {
      type: mongoose.Types.ObjectId,
      ref: 'Item',
      required: true,
    },
    sold: Boolean,
    deleted: Boolean,
  },
  { versionKey: false, timestamps: true }
)

export default mongoose.model<IBackpack>('Backpack', BackpackSchema)
