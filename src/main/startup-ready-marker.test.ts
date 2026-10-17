import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DRA_HOME_READY_LINE,
  DRA_LOGIN_READY_LINE,
  DRA_STARTUP_FAILURE_PREFIX,
  packagedStartupLogFile,
  recordPackagedStartupFailure,
  recordPackagedStartupLine,
  watchPackagedHomeReady
} from './startup-ready-marker'

const root = mkdtempSync(join(tmpdir(), 'dra-startup-ready-'))
const logFile = join(root, 'startup.log')

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('packaged startup log', () => {
  it('stays quiet when the smoke log is unset', () => {
    expect(packagedStartupLogFile({})).toBeUndefined()
    recordPackagedStartupLine(DRA_HOME_READY_LINE, {})
    recordPackagedStartupFailure('disk full', {})
    expect(() => readFileSync(logFile, 'utf8')).toThrow(/ENOENT/)
  })

  it('requires an absolute log path', () => {
    expect(() => packagedStartupLogFile({ DRA_STARTUP_LOG_FILE: 'startup.log' })).toThrow(
      'DRA_STARTUP_LOG_FILE must be an absolute path.'
    )
  })

  it('writes the home-ready line once and prefixes other failures', () => {
    const env = { DRA_STARTUP_LOG_FILE: `  ${logFile}  ` }
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    recordPackagedStartupLine(DRA_HOME_READY_LINE, env)
    recordPackagedStartupLine(DRA_HOME_READY_LINE, env)
    recordPackagedStartupFailure('disk full', env)
    recordPackagedStartupFailure(`${DRA_STARTUP_FAILURE_PREFIX}\n\ninventory mismatch`, env)

    const text = readFileSync(logFile, 'utf8')
    expect(text.match(/DRA home window ready/g)).toHaveLength(1)
    expect(text).toContain(`${DRA_STARTUP_FAILURE_PREFIX}\n\ndisk full`)
    expect(text.match(/DRA could not finish starting\./g)).toHaveLength(2)
    expect(stderr).toHaveBeenCalled()
  })

  it('swallows a log-path failure so the original startup error can still be shown', () => {
    expect(() =>
      recordPackagedStartupFailure('disk full', { DRA_STARTUP_LOG_FILE: 'relative.log' })
    ).not.toThrow()
  })
})

describe('watchPackagedHomeReady', () => {
  it('does nothing unless the window can run the readiness script', () => {
    const env = { DRA_STARTUP_LOG_FILE: logFile }
    expect(() => watchPackagedHomeReady({}, env)).not.toThrow()
    expect(() =>
      watchPackagedHomeReady({ webContents: { executeJavaScript: undefined } }, env)
    ).not.toThrow()
  })

  it('writes the ready line after the home dataset appears and stops when the window closes', async () => {
    vi.useFakeTimers()
    const readyLog = join(root, 'home.log')
    const executeJavaScript = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValue(true)
    let closed: (() => void) | undefined
    watchPackagedHomeReady(
      {
        isDestroyed: () => false,
        on: (event, listener) => {
          if (event === 'closed') closed = listener
        },
        webContents: { isDestroyed: () => false, executeJavaScript }
      },
      { DRA_STARTUP_LOG_FILE: readyLog }
    )

    await vi.advanceTimersByTimeAsync(500)
    expect(executeJavaScript).toHaveBeenCalledOnce()
    expect(() => readFileSync(readyLog, 'utf8')).toThrow(/ENOENT/)

    await vi.advanceTimersByTimeAsync(500)
    expect(readFileSync(readyLog, 'utf8')).toContain(DRA_HOME_READY_LINE)
    const calls = executeJavaScript.mock.calls.length
    closed?.()
    await vi.advanceTimersByTimeAsync(1500)
    expect(executeJavaScript).toHaveBeenCalledTimes(calls)
  })

  it('writes the login line when the sign-in screen is showing', async () => {
    vi.useFakeTimers()
    const loginLog = join(root, 'login.log')
    const executeJavaScript = vi.fn<() => Promise<unknown>>().mockResolvedValue('login')
    watchPackagedHomeReady(
      {
        isDestroyed: () => false,
        on: () => undefined,
        webContents: { isDestroyed: () => false, executeJavaScript }
      },
      { DRA_STARTUP_LOG_FILE: loginLog }
    )

    await vi.advanceTimersByTimeAsync(500)
    expect(readFileSync(loginLog, 'utf8')).toContain(DRA_LOGIN_READY_LINE)
    expect(readFileSync(loginLog, 'utf8')).not.toContain(DRA_HOME_READY_LINE)
  })

  it('does not read webContents after the window is destroyed', async () => {
    vi.useFakeTimers()
    let destroyed = false
    const executeJavaScript = vi.fn(async () => false)
    watchPackagedHomeReady(
      {
        isDestroyed: () => destroyed,
        on: () => undefined,
        get webContents() {
          if (destroyed) throw new Error('Object has been destroyed')
          return { isDestroyed: () => false, executeJavaScript }
        }
      },
      { DRA_STARTUP_LOG_FILE: join(root, 'destroyed.log') }
    )

    destroyed = true
    await vi.advanceTimersByTimeAsync(1000)
    expect(executeJavaScript).not.toHaveBeenCalled()
  })
})
