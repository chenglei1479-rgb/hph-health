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
 * The copy separates the two capabilities the product used to report as one "ready". Only the
 * schema-table Python (table import and statistics) works without the protected runtime; notebook code,
 * connector calls and the literature search do not, so the sentence must not claim "Notebook still
 * runs". It also names the two repairs the product actually has instead of asking for a blind retry.
 */
export const describeProtectedExecutionFailure = (message: string): string | undefined => {
  if (!isProtectedExecutionUnavailableMessage(message)) return undefined
  return i18next.t(
    'Protected execution could not start on this PC. Table import and statistics still work, but anything that needs the protected runtime (public literature search, for example) cannot work until this is fixed. Open Settings > Network and run the Notebook protection setup again; if it still fails, reinstall the app to update the protection component. ({{code}})',
    { code: PROTECTED_EXECUTION_UNAVAILABLE_CODE }
  )
}
