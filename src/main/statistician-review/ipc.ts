import { ipcMainHandle } from '../ipc-handler-registry'
import type { StatisticianReviewCommandOwner } from './application-commands'

export const registerStatisticianReviewIpc = (owner: StatisticianReviewCommandOwner): void => {
  ipcMainHandle('statistician-review:export-package', (_event, request: unknown) =>
    owner.exportPackage(request)
  )
}
