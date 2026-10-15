import type { NativeTranslator } from '../locale/main-process-messages'
import { englishNativeTranslator } from '../locale/main-process-messages'
import { ipcMainHandle } from '../ipc-handler-registry'
import { createStatisticianExportConfirmer } from './confirm-window'
import { exportStatisticianReviewPackage } from './export'

export const registerStatisticianReviewIpc = (
  translate: NativeTranslator = englishNativeTranslator
): void => {
  ipcMainHandle('statistician-review:export-package', (_event, request: unknown) =>
    exportStatisticianReviewPackage(request, {
      confirm: createStatisticianExportConfirmer(translate)
    })
  )
}
