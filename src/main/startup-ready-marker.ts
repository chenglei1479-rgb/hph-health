import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'

export const DRA_HOME_READY_LINE = 'DRA home window ready'
export const DRA_STARTUP_FAILURE_PREFIX = 'DRA could not finish starting.'

const LOG_ENV = 'DRA_STARTUP_LOG_FILE'
const POLL_MS = 500

type StartupEnv = NodeJS.ProcessEnv

// The packaged smoke sets this to an absolute path. Production launches leave it unset.
export const packagedStartupLogFile = (env: StartupEnv = process.env): string | undefined => {
  const value = env[LOG_ENV]?.trim()
  if (!value) return undefined
  if (!isAbsolute(value)) throw new Error('DRA_STARTUP_LOG_FILE must be an absolute path.')
  return value
}

const alreadyContains = (file: string, line: string): boolean => {
  try {
    return readFileSync(file, 'utf8').includes(line)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

export const recordPackagedStartupLine = (line: string, env: StartupEnv = process.env): void => {
  const file = packagedStartupLogFile(env)
  if (!file) return
  if (line === DRA_HOME_READY_LINE && alreadyContains(file, DRA_HOME_READY_LINE)) return
  mkdirSync(dirname(file), { recursive: true })
  appendFileSync(file, line.endsWith('\n') ? line : `${line}\n`, 'utf8')
}

// Write the dialog text before showErrorBox. That box blocks until a person dismisses it, so an
// unattended runner would hang unless the failure is already on disk.
export const recordPackagedStartupFailure = (
  message: string,
  env: StartupEnv = process.env
): void => {
  if (!env[LOG_ENV]?.trim()) return
  try {
    const text = message.includes(DRA_STARTUP_FAILURE_PREFIX)
      ? message
      : `${DRA_STARTUP_FAILURE_PREFIX}\n\n${message}`
    recordPackagedStartupLine(text, env)
    process.stderr.write(`${text.endsWith('\n') ? text : `${text}\n`}`)
  } catch {
    // A bad log path must not replace the startup error the dialog is about to show.
  }
}

type HomeReadyWindow = {
  isDestroyed?: () => boolean
  on?: (event: 'closed', listener: () => void) => void
  readonly webContents?: {
    isDestroyed?: () => boolean
    executeJavaScript?: (code: string) => Promise<unknown>
  }
}

// Polls only when the smoke log is configured. Reading webContents after destroy throws.
export const watchPackagedHomeReady = (
  window: HomeReadyWindow,
  env: StartupEnv = process.env
): void => {
  let file: string | undefined
  try {
    file = packagedStartupLogFile(env)
  } catch {
    return
  }
  if (!file) return
  if (window.isDestroyed?.()) return
  const execute = window.webContents?.executeJavaScript
  if (typeof execute !== 'function') return

  const timer = setInterval(() => {
    if (window.isDestroyed?.()) {
      clearInterval(timer)
      return
    }
    let contents: HomeReadyWindow['webContents']
    try {
      contents = window.webContents
    } catch {
      clearInterval(timer)
      return
    }
    if (!contents || contents.isDestroyed?.() || typeof contents.executeJavaScript !== 'function') {
      clearInterval(timer)
      return
    }
    void Promise.resolve()
      .then(() =>
        contents.executeJavaScript?.("document.documentElement?.dataset?.draHomeReady === '1'")
      )
      .then((ready) => {
        if (ready !== true) return
        clearInterval(timer)
        recordPackagedStartupLine(DRA_HOME_READY_LINE, env)
      })
      .catch(() => {
        // The page is not loaded yet, or the window was destroyed between polls.
      })
  }, POLL_MS)
  timer.unref?.()
  window.on?.('closed', () => clearInterval(timer))
}
