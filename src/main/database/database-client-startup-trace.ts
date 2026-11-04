import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

// Synchronous, small breadcrumbs survive a native engine abort before async logging drains.
// Diagnostic I/O failure must not change whether database verification succeeds or fails.
export const traceDatabaseClientStartup = async <T>(
  logDir: string,
  verify: () => Promise<T>,
  now: () => number = () => performance.now()
): Promise<T> => {
  const started = now()
  const record = (event: 'begin' | 'completed' | 'failed'): void => {
    try {
      mkdirSync(logDir, { recursive: true })
      appendFileSync(
        join(logDir, 'database-startup-trace.log'),
        JSON.stringify({
          at: new Date().toISOString(),
          pid: process.pid,
          startupPhase: 'database',
          operation: 'getProjectDbClient',
          event,
          elapsedMs: Math.max(0, now() - started)
        }) + '\n',
        'utf8'
      )
    } catch {
      /* Observability cannot alter the verification outcome. */
    }
  }
  record('begin')
  try {
    const client = await verify()
    record('completed')
    return client
  } catch (error) {
    record('failed')
    throw error
  }
}
