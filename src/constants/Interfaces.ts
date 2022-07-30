import { Request } from 'express'
import { Socket } from 'socket.io'
import { IUser } from '../models/User'

export interface RequestWithUserData extends Request {
  user?: any | IUser
}

export interface SocketWithUser extends Socket {
  user?: any
}
