import { ChildProcess } from 'node:child_process'
import { expect, it, vi } from 'vitest'
import {
  observeOwnedRuntimeProcess,
  ownedRuntimeProcessDiagnostics
} from './runtime-process-diagnostics'
const logs = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn() }))
vi.mock('@aipoch/diagnostics/node', () => ({ createLogger: () => logs }))
it.each([
  { code: null, signal: 'SIGSEGV' as const },
  { code: 70, signal: null },
  { code: 0, signal: null }
])('records exit $code / $signal even after transport loss', ({ code, signal }) => {
  logs.info.mockClear()
  logs.warn.mockClear()
  const child = new ChildProcess()
  let clock = 100
  const observation = observeOwnedRuntimeProcess(child, () => clock)
  observation.phase('database')
  clock = 125
  expect(ownedRuntimeProcessDiagnostics(child)).toMatchObject({
    uptimeMs: 25,
    exitCode: null,
    signal: null,
    startupPhase: 'database'
  })
  clock = 300
  child.emit('exit', code, signal)
  clock = 900
  expect(ownedRuntimeProcessDiagnostics(child)).toMatchObject({
    uptimeMs: 200,
    exitCode: code,
    signal,
    startupPhase: 'database'
  })
  expect(code === 0 ? logs.info : logs.warn).toHaveBeenCalledWith(
    'desktop runtime process exited',
    expect.objectContaining({ exitCode: code, signal, uptimeMs: 200, startupPhase: 'database' })
  )
})
