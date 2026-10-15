/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DRA_HOME_READY_LINE = 'DRA home window ready'
export const DRA_STARTUP_FAILURE_PREFIX = 'DRA could not finish starting.'

const readText = (file) => {
  try {
    return readFileSync(file, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return ''
    throw error
  }
}

export const defaultPidAlive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error && error.code === 'EPERM') return true
    return false
  }
}

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms))

// Exit condition for the packaged launch. Ready wins only when the failure phrase is absent.
export async function waitForPackagedStartup({
  logPath,
  pid,
  timeoutMs,
  pollMs = 500,
  extraPaths = [],
  now = Date.now,
  sleepFn = sleep,
  pidAlive = defaultPidAlive
}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('timeoutMs must be a positive number.')
  }
  const started = now()
  let detail = ''
  for (;;) {
    detail = [logPath, ...extraPaths].map((file) => readText(file)).join('\n')
    if (detail.includes(DRA_STARTUP_FAILURE_PREFIX)) {
      return { ok: false, reason: 'startup-error', detail }
    }
    if (detail.includes(DRA_HOME_READY_LINE)) {
      return { ok: true, reason: 'ready', detail }
    }
    if (pid !== undefined && !pidAlive(pid)) {
      return { ok: false, reason: 'exited', detail }
    }
    const elapsed = now() - started
    if (elapsed >= timeoutMs) return { ok: false, reason: 'timeout', detail }
    await sleepFn(Math.min(pollMs, timeoutMs - elapsed))
  }
}

const argumentValue = (argv, name) => {
  const index = argv.indexOf(name)
  if (index === -1) return undefined
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`)
  return value
}

export const parseWaitArgs = (argv) => {
  const logPath = argumentValue(argv, '--log')
  if (!logPath) throw new Error('--log is required.')
  const pidText = argumentValue(argv, '--pid')
  const timeoutText = argumentValue(argv, '--timeout-ms') ?? '240000'
  const timeoutMs = Number(timeoutText)
  if (!/^\d+$/.test(timeoutText) || timeoutMs <= 0)
    throw new Error('--timeout-ms must be a positive integer.')
  const pid = pidText === undefined ? undefined : Number(pidText)
  if (pidText !== undefined && (!/^\d+$/.test(pidText) || pid <= 0)) {
    throw new Error('--pid must be a positive integer.')
  }
  const extraPaths = []
  for (const name of ['--stdout', '--stderr']) {
    const value = argumentValue(argv, name)
    if (value) extraPaths.push(value)
  }
  return { logPath, pid, timeoutMs, extraPaths }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  try {
    const options = parseWaitArgs(process.argv.slice(2))
    const result = await waitForPackagedStartup(options)
    process.stderr.write(`${result.reason}\n${result.detail}\n`)
    process.exit(result.ok ? 0 : 1)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}
