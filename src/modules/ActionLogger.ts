import Action, { IAction } from '../models/Action'

export default function logAction(action: IAction) {
  return new Action(action).save()
}
