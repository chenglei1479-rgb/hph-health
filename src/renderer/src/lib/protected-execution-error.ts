import { i18next } from '@/i18n'
import {
  isProtectedExecutionUnavailableMessage,
  PROTECTED_EXECUTION_UNAVAILABLE_CODE
} from '../../../shared/protected-execution-diagnostics'

/**
 * Doctor-facing text for a protected-execution failure, or undefined for any other error. The
 * diagnostic number matches what the internal English log records, so a report can be correlated
 * without showing the raw exception.
 *
 * The copy separates the two capabilities the product used to report as one "ready": Notebook Python
 * runs on its own (the bundled interpreter starts and answers --version), while protected execution
 * needs the AppContainer host to prepare the runtime. Saying only "not ready" left a doctor unable to
 * tell which half was broken, and told nobody whether it could be fixed.
 */
export const describeProtectedExecutionFailure = (message: string): string | undefined => {
  if (!isProtectedExecutionUnavailableMessage(message)) return undefined
  return i18next.t(
    'Protected execution could not start on this PC. Notebook Python still runs, but anything that needs the protected runtime (public literature search, for example) cannot work until this is fixed. Open Settings > Network and run the Notebook protection setup again; if it still fails, reinstall the app to update the protection component. ({{code}})',
    { code: PROTECTED_EXECUTION_UNAVAILABLE_CODE }
  )
}
