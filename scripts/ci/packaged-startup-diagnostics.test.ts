import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { load } from 'js-yaml'

import {
  launchRecorded,
  publishStartupDiagnosticSummary,
  PRERELEASE_READY_LINES,
  SIGNED_OUT_READY_LINES
} from './packaged-startup-smoke.mjs'
import {
  DRA_HOME_READY_LINE,
  DRA_LOGIN_READY_LINE,
  DRA_TERMS_READY_LINE,
  DRA_ONBOARDING_READY_LINE,
  DRA_STARTUP_FAILURE_PREFIX
} from './wait-for-packaged-startup.mjs'

// Real OS child processes exercise inherited file handles, not mocked stream piping. These
// fixtures reproduce harness outcomes only; they are not Windows/macOS application launches.
it.each(['timeout', 'startup-error', 'ready', 'exited'] as const)(
  'retains child streams, current/legacy main logs and exact waiting anchors on %s',
  async (outcome) => {
    const root = mkdtempSync(join(tmpdir(), 'packaged-smoke-evidence-'))
    const userData = join(root, 'user data')
    const workspaceLogs = join(root, 'startup-logs')
    const logFile = join(root, 'startup.log')
    const code = `
      const fs = require('node:fs'); const path = require('node:path');
      const profile = ${JSON.stringify(userData)};
      for (const directory of ['desktop-logs', 'logs']) {
        fs.mkdirSync(path.join(profile, directory), {recursive: true});
        fs.writeFileSync(path.join(profile, directory, 'main.log'),
          'x'.repeat(20 * 1024) + directory + ' backend waiting; an old marker in main log: ' + ${JSON.stringify(DRA_HOME_READY_LINE)});
      }
      process.stdout.write('fixture stdout\\n');
      process.stderr.write('fixture stderr\\n');
      if (${JSON.stringify(outcome)} === 'startup-error') process.stderr.write(${JSON.stringify(DRA_STARTUP_FAILURE_PREFIX)} + '\\nfixture boot failure\\n');
      if (${JSON.stringify(outcome)} === 'ready') fs.writeFileSync(${JSON.stringify(logFile)}, ${JSON.stringify(DRA_HOME_READY_LINE)});
      if (${JSON.stringify(outcome)} === 'exited') process.exitCode = 17;
      else setInterval(() => {}, 1000);
    `
    try {
      const status = await launchRecorded({
        binary: process.execPath,
        args: ['-e', code],
        env: process.env,
        logFile,
        stdoutPath: join(root, 'old stdout.log'),
        stderrPath: join(root, 'old stderr.log'),
        timeoutMs: 1500,
        workspaceLogs,
        label: `fixture ${outcome}`,
        userData,
        readyLines: PRERELEASE_READY_LINES
      })
      expect(status).toBe(outcome === 'ready' ? 0 : 1)
      const diagnostics = JSON.parse(readFileSync(join(workspaceLogs, 'diagnostics.json'), 'utf8'))
      expect(diagnostics.reason).toBe(outcome)
      expect(diagnostics.expectedReadyLines).toEqual(PRERELEASE_READY_LINES)
      expect(diagnostics.timeoutMs).toBe(1500)
      expect(diagnostics.process.aliveBeforeCleanup).toBe(outcome !== 'exited')
      if (outcome === 'exited') expect(diagnostics.process.exitCode).toBe(17)
      const main = diagnostics.logs.find((log: { kind: string }) => log.kind === 'main (current)')
      expect(main.bytes).toBeGreaterThan(16 * 1024)
      expect(Buffer.byteLength(main.tail, 'utf8')).toBeLessThanOrEqual(16 * 1024)
      expect(readFileSync(join(workspaceLogs, 'stdout.log'), 'utf8')).toBe('fixture stdout\n')
      expect(readFileSync(join(workspaceLogs, 'stderr.log'), 'utf8')).toContain('fixture stderr\n')
      const text = readFileSync(join(workspaceLogs, 'diagnostics.txt'), 'utf8')
      expect(text).toContain('Waiting for ANY of these exact ready lines')
      expect(text).toContain('fixture stderr')
      expect(text).toContain('desktop-logs backend waiting')
      expect(
        readFileSync(join(workspaceLogs, 'app-logs', 'desktop-logs', 'main.log'), 'utf8')
      ).toContain('desktop-logs backend waiting')
      expect(readFileSync(join(workspaceLogs, 'app-logs', 'logs', 'main.log'), 'utf8')).toContain(
        'logs backend waiting'
      )
      expect(readFileSync(join(workspaceLogs, 'result.txt'), 'utf8')).toContain(`\n${outcome}\n`)
      const marker = diagnostics.logs.find((log: { kind: string }) => log.kind === 'startup marker')
      expect(marker.state).toBe(outcome === 'ready' ? 'read' : 'missing')
      // In the timeout case a ready line exists only in main.log. It must never grant success.
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
)

it('records missing logs and a spawn failure without an unhandled child error', async () => {
  const root = mkdtempSync(join(tmpdir(), 'packaged-smoke-spawn-'))
  try {
    const status = await launchRecorded({
      binary: join(root, 'nonexistent-app'),
      env: process.env,
      logFile: join(root, 'startup.log'),
      stdoutPath: join(root, 'stdout.log'),
      stderrPath: join(root, 'stderr.log'),
      timeoutMs: 1500,
      workspaceLogs: root,
      label: 'missing executable',
      userData: join(root, 'profile'),
      readyLines: PRERELEASE_READY_LINES
    })
    expect(status).toBe(1)
    const diagnostics = JSON.parse(readFileSync(join(root, 'diagnostics.json'), 'utf8'))
    expect(diagnostics.reason).toBe('spawn-error')
    expect(
      diagnostics.logs.find((log: { kind: string }) => log.kind === 'main (current)').state
    ).toBe('missing')
    expect(readFileSync(join(root, 'result.txt'), 'utf8')).toContain('ENOENT')
    expect(JSON.parse(readFileSync(join(root, 'launch.json'), 'utf8')).expectedReadyLines).toEqual(
      PRERELEASE_READY_LINES
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

it('keeps the original strict per-launch readiness sets', () => {
  expect(PRERELEASE_READY_LINES).toEqual([
    DRA_HOME_READY_LINE,
    DRA_TERMS_READY_LINE,
    DRA_ONBOARDING_READY_LINE
  ])
  expect(SIGNED_OUT_READY_LINES).toEqual([
    DRA_HOME_READY_LINE,
    DRA_LOGIN_READY_LINE,
    DRA_TERMS_READY_LINE,
    DRA_ONBOARDING_READY_LINE
  ])
})

it('uses supported native runners without bypassing or extending the smoke gates', () => {
  type Step = {
    name: string
    if?: string
    'timeout-minutes'?: number
    'continue-on-error'?: boolean
    run?: string
    with?: Record<string, string>
  }
  const workflow = load(readFileSync('.github/workflows/prerelease.yml', 'utf8')) as {
    jobs: {
      smoke: {
        'timeout-minutes': number
        'continue-on-error'?: boolean
        strategy: { matrix: { include: Array<{ os: string; label: string; artifact: string }> } }
        steps: Step[]
      }
    }
  }
  const smoke = workflow.jobs.smoke
  expect(smoke.strategy.matrix.include).toEqual([
    { os: 'windows-latest', label: 'Windows x64', artifact: 'dra-x64-win' },
    { os: 'macos-15', label: 'macOS arm64', artifact: 'dra-arm64-mac' },
    { os: 'macos-15-intel', label: 'macOS x64', artifact: 'dra-x64-mac' }
  ])
  expect(smoke['timeout-minutes']).toBe(40)
  expect(smoke['continue-on-error']).not.toBe(true)
  const launch = smoke.steps.find(
    (step) => step.name === 'Launch the packaged app and wait for home or sign-in'
  )!
  expect(launch['timeout-minutes']).toBe(20)
  expect(launch.run).toContain('--timeout-ms 240000')
  expect(launch['continue-on-error']).not.toBe(true)
  const upload = smoke.steps.find((step) => step.name === 'Upload the startup log')!
  expect(upload.if).toBe('always()')
  expect(upload.with?.path).toBe('startup-logs/**')
})

it('keeps home paths and raw main-log tails out of injected job output', async () => {
  const root = mkdtempSync(join(tmpdir(), 'packaged-smoke-private-'))
  const userData = join(root, 'profile')
  const workspaceLogs = join(root, 'startup-logs')
  const privateTail = 'PRIVATE_MAIN_LOG_BODY C:\\Users\\alice\\secret.txt /Users/alice/secret.txt'
  const written: string[] = []
  // Catch accidental console.error/process writes outside the injected summary writer too.
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    written.push(String(chunk))
    return true
  })
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    written.push(String(chunk))
    return true
  })
  try {
    const code = `
      const fs = require('node:fs'), path = require('node:path');
      const logs = path.join(${JSON.stringify(userData)}, 'desktop-logs');
      fs.mkdirSync(logs, {recursive:true});
      fs.writeFileSync(path.join(logs, 'main.log'), ${JSON.stringify(privateTail)});
      process.stderr.write(${JSON.stringify(DRA_STARTUP_FAILURE_PREFIX)});
      setInterval(() => {}, 1000);
    `
    expect(
      await launchRecorded({
        binary: process.execPath,
        args: ['-e', code],
        env: process.env,
        label: 'privacy fixture',
        logFile: join(root, 'startup.log'),
        stdoutPath: join(root, 'stdout.log'),
        stderrPath: join(root, 'stderr.log'),
        timeoutMs: 1500,
        workspaceLogs,
        userData,
        readyLines: PRERELEASE_READY_LINES,
        writeJobLog: (message: string) => written.push(message)
      })
    ).toBe(1)
    const output = written.join('')
    expect(output).toContain('startup-error')
    expect(output).toContain('main (current)')
    expect(output).not.toContain('Users')
    expect(output).not.toContain('alice')
    expect(output).not.toContain(root)
    expect(output).not.toContain('PRIVATE_MAIN_LOG_BODY')
    expect(output).not.toContain('ENOENT')
    // Detailed diagnostics are still available in the explicitly uploaded artifact.
    expect(readFileSync(join(workspaceLogs, 'diagnostics.txt'), 'utf8')).toContain(privateTail)
    expect(readFileSync(join(workspaceLogs, 'app-logs', 'desktop-logs', 'main.log'), 'utf8')).toBe(
      privateTail
    )
  } finally {
    stdout.mockRestore()
    stderr.mockRestore()
    rmSync(root, { recursive: true, force: true })
  }
})

it('publishes only the diagnostic summary allowlist', () => {
  const written: string[] = []
  publishStartupDiagnosticSummary(
    {
      label: 'Windows x64 prerelease',
      reason: 'spawn-error',
      expectedReadyLines: PRERELEASE_READY_LINES,
      process: {
        pid: 123,
        exitCode: null,
        signalCode: null,
        aliveBeforeCleanup: false,
        error: 'C:\\Users\\alice\\private.exe'
      },
      logs: [
        {
          kind: 'main (current)',
          state: 'read',
          bytes: 64,
          path: '/Users/alice/main.log',
          tail: 'PRIVATE_MAIN_LOG_BODY',
          error: 'private error detail'
        }
      ]
    },
    (message: string) => written.push(message)
  )
  expect(written).toHaveLength(1)
  expect(JSON.parse(written[0])).toEqual({
    label: 'Windows x64 prerelease',
    reason: 'spawn-error',
    expectedReadyLines: PRERELEASE_READY_LINES,
    process: { pid: 123, exitCode: null, signalCode: null, aliveBeforeCleanup: false },
    logs: [{ kind: 'main (current)', state: 'read', bytes: 64 }]
  })
})
