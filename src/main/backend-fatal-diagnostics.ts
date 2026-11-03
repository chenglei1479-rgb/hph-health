import type { EventEmitter } from 'node:events'
import {
  createLogger,
  diagnosticErrorFields,
  errorLogFields,
  writeFatalLogSync
} from '@aipoch/diagnostics/node'
import type { createBackendStartupReporter } from './backend-startup'

export const BACKEND_UNCAUGHT_EXIT_CODE = 70

// JS fatal events only: native faults must be observed by the owning parent process.
export const installBackendFatalDiagnostics = (
  reporter: Pick<ReturnType<typeof createBackendStartupReporter>, 'failed' | 'currentPhase'>,
  options: {
    events?: Pick<EventEmitter, 'on' | 'removeListener'>
    exit?: (code: number) => void
    record?: (event: string, error: unknown, phase: string) => void
  } = {}
): (() => void) => {
  const events = options.events ?? process
  const exit = options.exit ?? ((code: number) => process.exit(code))
  const record =
    options.record ??
    ((event, error, startupPhase) => {
      const fields = {
        event,
        startupPhase,
        ...diagnosticErrorFields(error),
        ...errorLogFields(error)
      }
      // The queued logger cannot be relied on during forced exit.
      writeFatalLogSync('node-runtime', 'uncaught backend failure', fields)
      createLogger('node-runtime').error('uncaught backend failure', fields)
    })
  let terminating = false
  const fail = (event: string, error: unknown): void => {
    if (terminating) return
    terminating = true
    try {
      record(event, error, reporter.currentPhase())
    } catch {
      // A broken diagnostic sink must not prevent the failed report or terminal exit.
    } finally {
      try {
        reporter.failed(error)
      } finally {
        exit(BACKEND_UNCAUGHT_EXIT_CODE)
      }
    }
  }
  const exception = (error: unknown): void => fail('uncaughtException', error)
  const rejection = (error: unknown): void => fail('unhandledRejection', error)
  events.on('uncaughtException', exception)
  events.on('unhandledRejection', rejection)
  return () => {
    events.removeListener('uncaughtException', exception)
    events.removeListener('unhandledRejection', rejection)
  }
}
