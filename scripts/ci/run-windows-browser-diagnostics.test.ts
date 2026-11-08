import { execFile, execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { load } from 'js-yaml'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { runWindowsBrowserDiagnostics } from './run-windows-browser-diagnostics.mjs'
import {
  PWSH_EXPECT_ENV,
  assertPwshExpectation,
  expectsPwsh,
  resolvePwshPolicy
} from './pwsh-policy.mjs'

vi.mock('node:child_process', async (original) => {
  const actual = await original<typeof import('node:child_process')>()
  return {
    ...actual,
    spawn: vi.fn(actual.spawn),
    execFile: vi.fn(actual.execFile),
    execFileSync: vi.fn(actual.execFileSync)
  }
})

const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process')
let root: string
let output: string
let testChild: ChildProcess

beforeEach(() => {
  vi.mocked(spawn).mockReset()
  vi.mocked(execFile).mockReset()
  vi.mocked(execFileSync).mockReset()
  root = mkdtempSync(join(tmpdir(), 'windows-browser-diagnostics-'))
  output = join(root, 'samples.ndjson')
})

afterEach(() => {
  testChild?.kill()
  vi.restoreAllMocks()
  rmSync(root, { recursive: true, force: true })
})

// Substitute only the platform commands, using real Node child exits. These checks exercise
// runner ownership/exit propagation, not a reproduction of the Windows network failure.
const layout = (code: number, immediate = false): void => {
  vi.mocked(spawn).mockImplementation(() => {
    testChild = actual.spawn(process.execPath, [
      '-e',
      immediate
        ? `process.exit(${code})`
        : `process.stdin.once('data', () => process.exit(${code}))`
    ])
    return testChild
  })
}

const records = (): Array<Record<string, unknown>> =>
  readFileSync(output, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))

it.each([0, 7])('preserves layout exit %i after a successful sample', async (code) => {
  layout(code)
  vi.mocked(execFile).mockImplementation((_file, _args, options, callback) =>
    actual.execFile(
      process.execPath,
      ['-e', 'console.log(JSON.stringify({processes:[],tcpStates:[],loopback4178States:[]}))'],
      options,
      (error, stdout, stderr) => {
        callback!(error, stdout, stderr)
        testChild.stdin!.end('finish')
      }
    )
  )
  expect(await runWindowsBrowserDiagnostics(join(root, "layout's script.tmp"), output)).toBe(code)
  expect(records()).toEqual([
    expect.objectContaining({
      startedAt: expect.any(String),
      endedAt: expect.any(String),
      status: 'ok',
      processes: [],
      tcpStates: [],
      loopback4178States: []
    })
  ])
  expect(execFile).toHaveBeenCalledOnce()
  expect(execFile).toHaveBeenCalledWith(
    'powershell.exe',
    expect.arrayContaining(['-Command', expect.stringContaining('IPGlobalProperties')]),
    expect.objectContaining({ timeout: 4000, maxBuffer: 1024 * 1024 }),
    expect.any(Function)
  )
  expect(vi.mocked(execFile).mock.calls[0]?.[1].join(' ')).not.toContain('Get-NetTCPConnection')
  expect(spawn).toHaveBeenCalledWith(
    'pwsh',
    expect.arrayContaining([
      expect.stringContaining("layout''s script.tmp"),
      expect.stringContaining('exit $LASTEXITCODE')
    ]),
    { stdio: 'inherit' }
  )
})

it.each([0, 7])('preserves exit %i when starting the sampler throws', async (code) => {
  layout(code, true)
  vi.mocked(execFile).mockImplementation(() => {
    throw new Error('query unavailable')
  })
  expect(await runWindowsBrowserDiagnostics('layout.tmp', output)).toBe(code)
  expect(records()).toEqual([
    expect.objectContaining({ status: 'error', code: 'sample-start-failed' })
  ])
  expect(records()[0]).not.toHaveProperty('tcpStates')
})

it.each([
  ['process.exit(3)', 3],
  ["console.log('invalid JSON')", 'invalid-json']
])('records a query failure without reporting zero resources: %s', async (source, errorCode) => {
  layout(0)
  vi.mocked(execFile).mockImplementation((_file, _args, options, callback) =>
    actual.execFile(process.execPath, ['-e', String(source)], options, (error, stdout, stderr) => {
      callback!(error, stdout, stderr)
      testChild.stdin!.end('finish')
    })
  )
  expect(await runWindowsBrowserDiagnostics('layout.tmp', output)).toBe(0)
  expect(records()[0]).toMatchObject({ status: 'error', code: errorCode })
  expect(records()[0]).not.toHaveProperty('tcpStates')
})

it('kills and waits for its in-flight sampler after a real nonzero test exit', async () => {
  layout(7, true)
  let sampler: ChildProcess | undefined
  vi.mocked(execFile).mockImplementation((_file, _args, options, callback) => {
    sampler = actual.execFile(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)'],
      options,
      callback
    )
    vi.spyOn(sampler, 'kill')
    return sampler
  })
  expect(await runWindowsBrowserDiagnostics('layout.tmp', output)).toBe(7)
  expect(sampler!.kill).toHaveBeenCalledOnce()
  expect(sampler!.signalCode).not.toBeNull()
  expect(records()[0]).toMatchObject({
    status: 'error',
    reason: 'cleanup',
    killed: true,
    signal: expect.any(String)
  })
})

it('distinguishes a query deadline from intentional cleanup', async () => {
  layout(0)
  vi.mocked(execFile).mockImplementation((_file, _args, options, callback) =>
    // Exercise execFile's real timeout callback without spending four seconds in the unit test.
    actual.execFile(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)'],
      { ...options, timeout: 50 },
      (error, stdout, stderr) => {
        callback!(error, stdout, stderr)
        testChild.stdin!.end('finish')
      }
    )
  )
  expect(await runWindowsBrowserDiagnostics('layout.tmp', output)).toBe(0)
  expect(records()[0]).toMatchObject({
    reason: 'query-timeout',
    code: null,
    killed: true,
    signal: expect.any(String)
  })
})

it.each([0, 7])('confirms owned taskkill cleanup without replacing exit %i', async (code) => {
  layout(code, true)
  const sampler = {
    pid: 12345,
    exitCode: null as number | null,
    signalCode: null as string | null,
    kill: vi.fn(() => {
      throw new Error('stop failed')
    }),
    stdout: { destroy: vi.fn() },
    stderr: { destroy: vi.fn() },
    unref: vi.fn()
  }
  vi.mocked(execFile).mockReturnValue(sampler as unknown as ReturnType<typeof execFile>)
  vi.mocked(execFileSync).mockImplementation(() => {
    sampler.signalCode = 'SIGTERM'
    return Buffer.alloc(0)
  })
  expect(await runWindowsBrowserDiagnostics('layout.tmp', output)).toBe(code)
  expect(records().map((record) => record.code)).toEqual([
    'sample-stop-failed',
    'sample-stop-timeout',
    'sample-exit-confirmed'
  ])
  expect(sampler.stdout.destroy).toHaveBeenCalledOnce()
  expect(sampler.unref).toHaveBeenCalledOnce()
  expect(execFile).toHaveBeenCalledOnce()
  expect(execFileSync).toHaveBeenCalledWith('taskkill.exe', ['/PID', '12345', '/T', '/F'], {
    timeout: 1000,
    windowsHide: true,
    stdio: 'ignore'
  })
})

it('reports failed fallback and unconfirmed exit without masking the test result', async () => {
  layout(7, true)
  const sampler = {
    pid: 12345,
    exitCode: null,
    signalCode: null,
    kill: vi.fn(() => false),
    unref: vi.fn()
  }
  vi.mocked(execFile).mockReturnValue(sampler as unknown as ReturnType<typeof execFile>)
  vi.mocked(execFileSync).mockImplementation(() => {
    throw new Error('taskkill timed out')
  })
  expect(await runWindowsBrowserDiagnostics('layout.tmp', output)).toBe(7)
  expect(records().map((record) => record.code)).toEqual([
    'sample-stop-failed',
    'sample-stop-timeout',
    'sample-taskkill-failed',
    'sample-exit-unconfirmed'
  ])
})

it('keeps a diagnostic write failure from masking the test failure', async () => {
  layout(7, true)
  writeFileSync(output, 'a file cannot contain child files')
  vi.mocked(execFile).mockImplementation(() => {
    throw new Error('unavailable')
  })
  const warn = vi.spyOn(console, 'error').mockImplementation(() => {})
  expect(await runWindowsBrowserDiagnostics('layout.tmp', join(output, 'child'))).toBe(7)
  expect(warn).toHaveBeenCalledWith('Windows browser diagnostics: could not write sample.')
})

it('restarts once when a fresh NetLog proves Windows ran out of socket buffer space', async () => {
  let attempts = 0
  vi.mocked(spawn).mockImplementation(() => {
    attempts += 1
    if (attempts === 1) {
      writeFileSync(
        join(root, 'netlog-first.json'),
        JSON.stringify({ events: [{ params: { os_error: 10055, net_error: -176 } }] })
      )
    }
    testChild = actual.spawn(process.execPath, ['-e', `process.exit(${attempts === 1 ? 7 : 0})`])
    return testChild
  })
  vi.mocked(execFile).mockImplementation(() => {
    throw new Error('diagnostics unavailable')
  })

  expect(await runWindowsBrowserDiagnostics('layout.tmp', output)).toBe(0)
  expect(spawn).toHaveBeenCalledTimes(2)
  expect(records()).toContainEqual(
    expect.objectContaining({
      status: 'retry',
      reason: 'windows-no-buffer-space',
      attempt: 1
    })
  )
})

it('does not restart for stale NetLog evidence', async () => {
  writeFileSync(
    join(root, 'netlog-previous.json'),
    JSON.stringify({ events: [{ params: { os_error: 10055, net_error: -176 } }] })
  )
  layout(7, true)
  vi.mocked(execFile).mockImplementation(() => {
    throw new Error('diagnostics unavailable')
  })

  expect(await runWindowsBrowserDiagnostics('layout.tmp', output)).toBe(7)
  expect(spawn).toHaveBeenCalledOnce()
  expect(records()).not.toContainEqual(expect.objectContaining({ status: 'retry' }))
})


// The two real-shell cases below need PowerShell 7 (`pwsh`) on PATH. Both call sites use `-Command`,
// so the execution policy is not the constraint - Windows PowerShell 5.1 alone cannot run them.
// A red job nobody can explain gets ignored, so a missing `pwsh` is a named skip when it is not
// declared: scripts/ci/scripts-job-skip-allowances.json carries the reason. When the job declares
// `${PWSH_EXPECT_ENV}=1` (see scripts/ci/pwsh-expectation.test.ts) the same absence must be red.
const pwshAvailable =
  process.platform === 'win32' &&
  spawnSync('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', 'exit 0']).status === 0
const pwshPolicy = resolvePwshPolicy({ pwshAvailable, expectPwsh: expectsPwsh(process.env) })

// Runs unconditionally: when the policy is `fail` this throws instead of skipping, which is the whole
// point - the number of executed assertions must not silently shrink on a runner that promised pwsh.
it('has PowerShell 7 whenever the job declares it', () => {
  assertPwshExpectation(pwshPolicy)
})

it('names a missing pwsh instead of reporting a bare exit 1', async () => {
  vi.mocked(spawn).mockImplementation(() => {
    const child = new EventEmitter()
    queueMicrotask(() =>
      child.emit('error', Object.assign(new Error('spawn pwsh ENOENT'), { code: 'ENOENT' }))
    )
    return child as unknown as ChildProcess
  })
  vi.mocked(execFile).mockImplementation(() => {
    throw new Error('diagnostics unavailable')
  })
  expect(await runWindowsBrowserDiagnostics('layout.tmp', output)).toBe(1)
  expect(records()).toContainEqual(
    expect.objectContaining({ status: 'error', reason: 'pwsh-missing', code: 'ENOENT' })
  )
})

it.skipIf(pwshPolicy !== 'run').each([0, 7])(
  'preserves native exit %i through the real PowerShell shell',
  async (code) => {
    vi.mocked(spawn).mockImplementation(actual.spawn)
    vi.mocked(execFile).mockImplementation(() => {
      throw new Error('diagnostics unavailable')
    })
    const script = join(root, "layout's script.tmp")
    writeFileSync(
      script,
      `& '${process.execPath.replaceAll("'", "''")}' -e 'process.exit(${code})'`
    )
    expect(await runWindowsBrowserDiagnostics(script, output)).toBe(code)
  }
)

// This one only needs `powershell.exe` for the query: it substitutes the layout child via `layout(0)`,
// so a missing `pwsh` must not silence it.
it.skipIf(process.platform !== 'win32')(
  'collects an actual Windows process and TCP sample',
  async () => {
    layout(0)
    // This smoke checks the native query/schema, not the best-effort sampling deadline.
    // CIM/NetTCPConnection cold starts can exceed four seconds on shared Windows runners.
    // Keep the layout alive until the query completes instead of racing a fixed sleep.
    vi.mocked(execFile).mockImplementation((file, args, options, callback) =>
      actual.execFile(file, args, { ...options, timeout: 30_000 }, (error, stdout, stderr) => {
        callback!(error, stdout, stderr)
        testChild.stdin!.end('finish')
      })
    )
    vi.mocked(execFileSync).mockImplementation(actual.execFileSync)
    expect(await runWindowsBrowserDiagnostics('native-query.tmp', output)).toBe(0)
    const sample = records().find((record) => record.status === 'ok')
    expect(sample, JSON.stringify(records())).toMatchObject({
      processes: expect.arrayContaining([
        expect.objectContaining({
          ProcessId: process.pid,
          Name: 'node.exe',
          CreationDate: expect.anything(),
          HandleCount: expect.anything(),
          WorkingSetSize: expect.anything(),
          PrivatePageCount: expect.anything()
        })
      ]),
      tcpStates: expect.any(Array),
      loopback4178States: expect.any(Array)
    })
  },
  40_000
)
