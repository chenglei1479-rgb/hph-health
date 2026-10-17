import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { expect, it } from 'vitest'

import {
  DRA_HOME_READY_LINE,
  DRA_LOGIN_READY_LINE,
  DRA_STARTUP_FAILURE_PREFIX,
  parseWaitArgs,
  waitForPackagedStartup
} from './wait-for-packaged-startup.mjs'

const root = mkdtempSync(join(tmpdir(), 'dra-startup-wait-'))

it('returns ready only when the home line is present and the failure phrase is not', async () => {
  const logPath = join(root, 'ready.log')
  writeFileSync(logPath, `${DRA_HOME_READY_LINE}\n`)
  const result = await waitForPackagedStartup({
    logPath,
    timeoutMs: 1000,
    pidAlive: () => true,
    sleepFn: async () => undefined
  })
  expect(result).toMatchObject({ ok: true, reason: 'ready' })
})

it('accepts the login screen only when that line is requested', async () => {
  const logPath = join(root, 'login.log')
  writeFileSync(logPath, `${DRA_LOGIN_READY_LINE}\n`)
  let calls = 0
  const homeOnly = await waitForPackagedStartup({
    logPath,
    timeoutMs: 1000,
    pidAlive: () => true,
    now: () => (calls++ === 0 ? 0 : 1000),
    sleepFn: async () => undefined
  })
  expect(homeOnly).toMatchObject({ ok: false, reason: 'timeout' })
  const signedOut = await waitForPackagedStartup({
    logPath,
    timeoutMs: 1000,
    readyLines: [DRA_HOME_READY_LINE, DRA_LOGIN_READY_LINE],
    pidAlive: () => true,
    sleepFn: async () => undefined
  })
  expect(signedOut).toMatchObject({ ok: true, reason: 'ready' })
})

it('fails when startup reports the dialog error, even if the process is still alive', async () => {
  const logPath = join(root, 'failed.log')
  writeFileSync(logPath, `${DRA_STARTUP_FAILURE_PREFIX}\n\ninventory mismatch\n`)
  const result = await waitForPackagedStartup({
    logPath,
    pid: 1,
    timeoutMs: 1000,
    pidAlive: () => true,
    sleepFn: async () => undefined
  })
  expect(result.ok).toBe(false)
  expect(result.reason).toBe('startup-error')
})

it('fails when the process exits before home and when the wait times out', async () => {
  const logPath = join(root, 'missing.log')
  const exited = await waitForPackagedStartup({
    logPath,
    pid: 4242,
    timeoutMs: 1000,
    pidAlive: () => false,
    sleepFn: async () => undefined
  })
  expect(exited).toMatchObject({ ok: false, reason: 'exited' })

  let calls = 0
  const timedOut = await waitForPackagedStartup({
    logPath,
    pid: 7,
    timeoutMs: 1000,
    pollMs: 400,
    now: () => {
      calls += 1
      return calls === 1 ? 0 : 1000
    },
    pidAlive: () => true,
    sleepFn: async () => undefined
  })
  expect(timedOut).toMatchObject({ ok: false, reason: 'timeout' })
})

it('reads a failure that was written only to stderr', async () => {
  const stderrPath = join(root, 'stderr.log')
  writeFileSync(stderrPath, `${DRA_STARTUP_FAILURE_PREFIX}\n`)
  const result = await waitForPackagedStartup({
    logPath: join(root, 'absent.log'),
    extraPaths: [stderrPath],
    timeoutMs: 500,
    pidAlive: () => true,
    sleepFn: async () => undefined
  })
  expect(result.reason).toBe('startup-error')
})

it('parses the waiter arguments', () => {
  expect(
    parseWaitArgs([
      '--log',
      '/tmp/startup.log',
      '--pid',
      '15',
      '--timeout-ms',
      '240000',
      '--stderr',
      '/tmp/err'
    ])
  ).toEqual({
    logPath: '/tmp/startup.log',
    pid: 15,
    timeoutMs: 240000,
    extraPaths: ['/tmp/err']
  })
  expect(() => parseWaitArgs([])).toThrow('--log is required.')
})

it('exits 0 from the command line only after the home line is on disk', async () => {
  const logPath = join(root, 'cli.log')
  writeFileSync(logPath, `${DRA_HOME_READY_LINE}\n`)
  const child = spawn(
    process.execPath,
    ['scripts/ci/wait-for-packaged-startup.mjs', '--log', logPath, '--timeout-ms', '1000'],
    { cwd: process.cwd() }
  )
  const code = await new Promise<number>((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (exitCode) => resolve(exitCode ?? 1))
  })
  expect(code).toBe(0)
})
