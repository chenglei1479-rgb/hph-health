import type { ChildProcess } from 'node:child_process'
import { createLogger } from '@aipoch/diagnostics/node'
import type { BackendStartupStatus } from './backend-startup'

export const runtimeExitCodeHex = (exitCode: number | null): string | null =>
  typeof exitCode === 'number' ? (exitCode >>> 0).toString(16).toUpperCase().padStart(8, '0') : null

type Observation = {
  snapshot: () => {
    pid: number | null
    exitCode: number | null
    exitCodeHex: string | null
    signal: string | null
    uptimeMs: number | null
    startupPhase: BackendStartupStatus['stage'] | null
  }
  phase: (stage: BackendStartupStatus['stage']) => void
}
const observations = new WeakMap<ChildProcess, Observation>()

export const ownedRuntimeProcessDiagnostics = (
  child: ChildProcess
): ReturnType<Observation['snapshot']> =>
  observations.get(child)?.snapshot() ?? {
    pid: child.pid ?? null,
    exitCode: child.exitCode,
    exitCodeHex: runtimeExitCodeHex(child.exitCode),
    signal: child.signalCode,
    uptimeMs: null,
    startupPhase: null // An adopted/untracked process has no known launch time.
  }

export const observeOwnedRuntimeProcess = (
  child: ChildProcess,
  now: () => number = () => performance.now()
): Observation => {
  const existing = observations.get(child)
  if (existing) return existing
  const started = now()
  let exitCode = child.exitCode
  let signal: string | null = child.signalCode
  let stoppedAt: number | undefined
  let startupPhase: BackendStartupStatus['stage'] = 'bootstrap'
  const observation: Observation = {
    phase: (stage) => {
      startupPhase = stage
    },
    snapshot: () => ({
      pid: child.pid ?? null,
      exitCode,
      exitCodeHex: runtimeExitCodeHex(exitCode),
      signal,
      uptimeMs: Math.max(0, (stoppedAt ?? now()) - started),
      startupPhase
    })
  }
  observations.set(child, observation)
  // Keep listening even when WebSocket close is delivered before the process exit event.
  child.once('exit', (code, exitSignal) => {
    exitCode = code
    signal = exitSignal
    stoppedAt = now()
    try {
      const logger = createLogger('desktop-runtime-client')
      logger[code === 0 && exitSignal === null ? 'info' : 'warn'](
        'desktop runtime process exited',
        observation.snapshot()
      )
    } catch {
      /* Observing a child exit must not crash the parent. */
    }
  })
  return observation
}
