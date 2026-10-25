import type { TFunction } from 'i18next'

import {
  localizeApplicationCommandError,
  stripBridgedCommandErrorCode
} from './application-command-error-message'

// The preload carries a command code in the message so it survives contextBridge; a doctor must not
// read that prefix when the surface falls back to the raw detail.
const errorDetail = (error: unknown): string | undefined => {
  if (error instanceof Error) return stripBridgedCommandErrorCode(error.message)
  if (typeof error === 'string') return stripBridgedCommandErrorCode(error)
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return stripBridgedCommandErrorCode(error.message)
  }
  return undefined
}

// Shared notice text: a structured command failure becomes operable copy keyed by its code, while
// every other thrown value keeps its existing detail. `errorDetail` stays the raw-English unwrap for
// logs, diagnostics and developer disclosures.
const errorNoticeDetail = (error: unknown, t: TFunction): string | undefined =>
  localizeApplicationCommandError(error, t) ?? errorDetail(error)

export { errorDetail, errorNoticeDetail }
