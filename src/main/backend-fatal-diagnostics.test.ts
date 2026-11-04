import { EventEmitter } from 'node:events'
import { expect, it, vi } from 'vitest'
import {
  installBackendFatalDiagnostics,
  BACKEND_UNCAUGHT_EXIT_CODE
} from './backend-fatal-diagnostics'

it.each(['uncaughtException', 'unhandledRejection'])(
  'records %s at the current phase, reports failure and exits 70',
  (event) => {
    const events = new EventEmitter()
    const record = vi.fn(),
      failed = vi.fn(),
      exit = vi.fn()
    const dispose = installBackendFatalDiagnostics(
      { currentPhase: () => 'database', failed },
      { events, record, exit }
    )
    const error = new Error('fatal fixture')
    events.emit(event, error)
    expect(record).toHaveBeenCalledWith(event, error, 'database')
    expect(failed).toHaveBeenCalledWith(error)
    expect(exit).toHaveBeenCalledWith(BACKEND_UNCAUGHT_EXIT_CODE)
    expect(record.mock.invocationCallOrder[0]).toBeLessThan(failed.mock.invocationCallOrder[0])
    expect(failed.mock.invocationCallOrder[0]).toBeLessThan(exit.mock.invocationCallOrder[0])
    events.emit(event, error)
    expect(exit).toHaveBeenCalledTimes(1)
    dispose()
    expect(events.listenerCount(event)).toBe(0)
  }
)

it('still reports and exits when the fatal logging sink throws', () => {
  const events = new EventEmitter(),
    failed = vi.fn(),
    exit = vi.fn()
  const dispose = installBackendFatalDiagnostics(
    { currentPhase: () => 'database', failed },
    {
      events,
      exit,
      record: () => {
        throw new Error('sink unavailable')
      }
    }
  )
  const failure = new Error('original fatal failure')
  events.emit('uncaughtException', failure)
  expect(failed).toHaveBeenCalledWith(failure)
  expect(exit).toHaveBeenCalledWith(70)
  dispose()
})
