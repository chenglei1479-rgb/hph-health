import { i18next } from '@/i18n'
import {
  isProtectedExecutionUnavailableMessage,
  PROTECTED_EXECUTION_UNAVAILABLE_CODE
} from '../../../shared/protected-execution-diagnostics'

/**
 * Doctor-facing text for a protected-execution failure, or undefined for any other error. The
 * diagnostic number matches what the internal English log records, so a report can be correlated
 * without showing the raw exception.
 */
export const describeProtectedExecutionFailure = (message: string): string | undefined => {
  if (!isProtectedExecutionUnavailableMessage(message)) return undefined
  return i18next.t(
    'Protected execution could not start on this PC. Open Settings > Network, finish the Notebook protection setup, then retry. ({{code}})',
    { code: PROTECTED_EXECUTION_UNAVAILABLE_CODE }
  )
}
