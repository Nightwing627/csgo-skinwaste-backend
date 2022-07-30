import mongoose, { Schema, Document } from 'mongoose'

export interface IAPIDebugger extends Document {
  //   _id: string | Schema.Types.ObjectId
  action: string
  location: string
  data: string
  info?: string
  createdAt?: Date
  updatedAt?: Date
}

const APIDebuggerSchema: Schema = new Schema(
  {
    action: {
      type: String,
      required: true,
    },
    location: {
      type: String,
      required: true,
    },
    data: {
      type: String,
      required: true,
    },
    info: {
      type: String,
    },
  },
  { versionKey: false, timestamps: true }
)

export default mongoose.model<IAPIDebugger>('APIDebugger', APIDebuggerSchema)
