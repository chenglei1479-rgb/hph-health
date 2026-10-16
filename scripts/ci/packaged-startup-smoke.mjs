/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { spawn, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { waitForPackagedStartup } from './wait-for-packaged-startup.mjs'

// Non-C: install directory with a space, matching a doctor install such as D:\DRA\medresearch-agent.
export const WINDOWS_SMOKE_DRIVE = 'D:'
export const WINDOWS_SMOKE_INSTALL_DIR = 'D:\\DRA Test\\medresearch-agent'
export const WINDOWS_SMOKE_CONFIG_ROOT = 'D:\\DRA Test\\config root'
export const WINDOWS_SMOKE_USER_DATA = 'D:\\DRA Test\\user data'
export const WINDOWS_SMOKE_LOG_FILE = 'D:\\DRA Test\\startup.log'
export const WINDOWS_SMOKE_DATA_ROOT = 'D:\\DRA Test\\MedResearchAgent'

export const smokeSettingsJson = (dataRoot) =>
  `${JSON.stringify({ version: 2, providers: [], onboardingCompletedAt: 1, dataRoot })}\n`

// The first launch asks for a hospital approval number and waits until that window closes.
// A decline is the same record the app writes when the window is dismissed, and it leaves the
// PHI gate closed. The smoke does not approve the machine.
export const declinedMachineApprovalLine = () =>
  `${JSON.stringify({
    at: '2026-10-15T00:00:00.000Z',
    approved: false,
    approvalNumber: null
  })}\n`

// cmd /s /c strips one pair of surrounding quotes. /D= stays last and unquoted, spaces included.
export const windowsSilentInstallCommand = (setupPath, installDir = WINDOWS_SMOKE_INSTALL_DIR) => {
  if (!setupPath) throw new Error('NSIS setup path is required.')
  return `cmd.exe /d /s /c ""${setupPath}" /S /D=${installDir}"`
}

export const windowsSilentInstallArgs = (setupPath, installDir = WINDOWS_SMOKE_INSTALL_DIR) => [
  '/d',
  '/s',
  '/c',
  `""${setupPath}" /S /D=${installDir}"`
]

// Finder's right-click Open removes com.apple.quarantine. This is that attribute and nothing else:
// it does not add a Developer ID signature or a notarization ticket.
export const macQuarantineClearCommand = (target) => [
  'xattr',
  '-dr',
  'com.apple.quarantine',
  target
]

export const packagedSmokeEnv = (base, paths) => {
  const env = {}
  for (const [key, value] of Object.entries(base)) {
    if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') env[key] = value
  }
  env.DRA_PRERELEASE = '1'
  env.OPEN_SCIENCE_CONFIG_ROOT = paths.configRoot
  env.OPEN_SCIENCE_USER_DATA = paths.userData
  env.DRA_STARTUP_LOG_FILE = paths.logFile
  return env
}

const argumentValue = (argv, name) => {
  const index = argv.indexOf(name)
  if (index === -1) return undefined
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`)
  return value
}

const walk = (directory) => {
  const found = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) found.push(...walk(path))
    else found.push(path)
  }
  return found
}

const findArtifact = (directory, suffix) => {
  const matches = walk(directory).filter((file) => file.toLowerCase().endsWith(suffix))
  if (matches.length === 0) throw new Error(`No ${suffix} artifact under ${directory}.`)
  return matches[0]
}

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited ${result.status ?? 'null'}.`)
  }
}

const clearQuarantine = (target) => {
  const [command, ...args] = macQuarantineClearCommand(target)
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.status !== 0) {
    process.stdout.write(
      `Quarantine attribute was already absent on ${target} (xattr exit ${result.status ?? 'null'}).\n`
    )
  }
}

const writeSmokeSettings = (configRoot, dataRoot) => {
  mkdirSync(configRoot, { recursive: true })
  mkdirSync(dataRoot, { recursive: true })
  writeFileSync(join(configRoot, 'settings.json'), smokeSettingsJson(dataRoot))
}

const seedDeclinedMachineApproval = (userData) => {
  const file = join(userData, 'phi-vault', 'machine-approval.jsonl')
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, declinedMachineApprovalLine(), { mode: 0o600 })
}

const mirrorAppLogs = (userData, workspaceLogs) => {
  const logs = join(userData, 'logs')
  if (!existsSync(logs)) return
  const target = join(workspaceLogs, 'app-logs')
  mkdirSync(target, { recursive: true })
  for (const name of readdirSync(logs)) {
    try {
      copyFileSync(join(logs, name), join(target, name))
    } catch {
      // Rotated logs can be directories. The main log is a file.
    }
  }
}

const mirrorLog = (source, target) => {
  try {
    copyFileSync(source, target)
  } catch {
    // The app may not have created the log yet. result.txt still explains why.
  }
}

const stopPackagedApp = (pid) => {
  if (!pid) return
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // The process already exited.
    }
  }
}

const launchPackagedApp = (binary, env) => {
  const child = spawn(binary, [], {
    detached: true,
    stdio: process.platform === 'win32' ? 'ignore' : ['ignore', 'pipe', 'pipe'],
    env,
    cwd: dirname(binary),
    windowsHide: false
  })
  if (!child.pid) throw new Error(`Failed to launch ${binary}.`)
  return child
}

const publishSummary = (label, result) => {
  const line =
    result.reason === 'ready'
      ? `${label} reached the home window.`
      : `${label} did not reach the home window (${result.reason}).`
  process.stdout.write(`${line}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`, { flag: 'a' })
  }
}

const finish = async ({
  child,
  logFile,
  stdoutPath,
  stderrPath,
  timeoutMs,
  workspaceLogs,
  label,
  userData
}) => {
  mkdirSync(workspaceLogs, { recursive: true })
  if (child.stdout) child.stdout.pipe(createWriteStream(stdoutPath))
  if (child.stderr) child.stderr.pipe(createWriteStream(stderrPath))
  let result
  try {
    result = await waitForPackagedStartup({
      logPath: logFile,
      pid: child.pid,
      timeoutMs,
      extraPaths: [stdoutPath, stderrPath]
    })
  } finally {
    stopPackagedApp(child.pid)
    mirrorLog(logFile, join(workspaceLogs, 'startup.log'))
    mirrorLog(stdoutPath, join(workspaceLogs, 'stdout.log'))
    mirrorLog(stderrPath, join(workspaceLogs, 'stderr.log'))
    if (userData) mirrorAppLogs(userData, workspaceLogs)
  }
  writeFileSync(join(workspaceLogs, 'result.txt'), `${label}\n${result.reason}\n${result.detail}`)
  publishSummary(label, result)
  return result.ok ? 0 : 1
}

const macSmokePaths = () => {
  const root = join(homedir(), 'DRA Test')
  return {
    app: join(homedir(), 'Applications', 'DRA Test', 'DRA.app'),
    configRoot: join(root, 'config root'),
    dataRoot: join(root, 'MedResearchAgent'),
    userData: join(root, 'user data'),
    logFile: join(root, 'startup.log'),
    stdoutPath: join(root, 'stdout.log'),
    stderrPath: join(root, 'stderr.log')
  }
}

const attachDmg = (dmg) => {
  const result = spawnSync('hdiutil', ['attach', '-nobrowse', '-readonly', dmg], {
    encoding: 'utf8'
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'hdiutil attach failed.')
  }
  const mounts = result.stdout.match(/\/Volumes\/[^\n\r]+/g)
  if (!mounts || mounts.length === 0) {
    throw new Error(`hdiutil did not report a volume.\n${result.stdout}`)
  }
  return mounts[mounts.length - 1].trim()
}

const assertMacArchitecture = (binary) => {
  const result = spawnSync('file', ['-b', binary], { encoding: 'utf8' })
  const text = `${result.stdout ?? ''}`
  const expected = process.arch === 'arm64' ? 'arm64' : 'x86_64'
  if (!text.includes(expected)) {
    throw new Error(
      `Expected a ${expected} application binary on this runner. file says: ${text.trim()}`
    )
  }
}

const runMac = async ({ artifactDir, timeoutMs, workspaceLogs, label }) => {
  const dmg = findArtifact(artifactDir, '.dmg')
  const paths = macSmokePaths()
  mkdirSync(dirname(paths.app), { recursive: true })
  mkdirSync(paths.configRoot, { recursive: true })
  clearQuarantine(dmg)
  const mount = attachDmg(dmg)
  try {
    const mountedApp = readdirSync(mount).find((name) => name.endsWith('.app'))
    if (!mountedApp) throw new Error(`The disk image has no application bundle: ${mount}`)
    paths.app = join(homedir(), 'Applications', 'DRA Test', mountedApp)
    mkdirSync(dirname(paths.app), { recursive: true })
    run('ditto', [join(mount, mountedApp), paths.app])
  } finally {
    spawnSync('hdiutil', ['detach', mount], { stdio: 'inherit' })
  }
  clearQuarantine(paths.app)
  const macOsDir = join(paths.app, 'Contents', 'MacOS')
  const executableName = readdirSync(macOsDir).find((name) => !name.startsWith('.'))
  if (!executableName) throw new Error(`The application bundle has no executable: ${macOsDir}`)
  const binary = join(macOsDir, executableName)
  assertMacArchitecture(binary)
  writeSmokeSettings(paths.configRoot, paths.dataRoot)
  mkdirSync(paths.userData, { recursive: true })
  seedDeclinedMachineApproval(paths.userData)
  const child = launchPackagedApp(binary, packagedSmokeEnv(process.env, paths))
  return finish({
    child,
    logFile: paths.logFile,
    stdoutPath: paths.stdoutPath,
    stderrPath: paths.stderrPath,
    timeoutMs,
    workspaceLogs,
    label,
    userData: paths.userData
  })
}

const mapWindowsDrive = () => {
  // GitHub-hosted Windows runners already mount D: (the work directory is D:\a\...).
  // subst cannot replace that real volume and fails with "Invalid parameter - D:".
  if (existsSync(`${WINDOWS_SMOKE_DRIVE}\\`)) {
    process.stdout.write(
      `${WINDOWS_SMOKE_DRIVE} is already mounted; installing under D:\\DRA Test.\n`
    )
    return
  }
  const root = join(process.env.RUNNER_TEMP || tmpdir(), 'dra-smoke-root')
  mkdirSync(root, { recursive: true })
  spawnSync('subst', [WINDOWS_SMOKE_DRIVE, '/d'], { stdio: 'ignore' })
  run('subst', [WINDOWS_SMOKE_DRIVE, root])
}

const runWindows = async ({ artifactDir, timeoutMs, workspaceLogs, label }) => {
  const setup = findArtifact(artifactDir, '-setup.exe')
  spawnSync(
    'powershell.exe',
    ['-NoProfile', '-Command', `Unblock-File -LiteralPath '${setup.replaceAll("'", "''")}'`],
    { stdio: 'inherit' }
  )
  mapWindowsDrive()
  mkdirSync('D:\\DRA Test', { recursive: true })
  run('cmd.exe', windowsSilentInstallArgs(setup), { windowsVerbatimArguments: true })
  writeSmokeSettings(WINDOWS_SMOKE_CONFIG_ROOT, WINDOWS_SMOKE_DATA_ROOT)
  mkdirSync(WINDOWS_SMOKE_USER_DATA, { recursive: true })
  seedDeclinedMachineApproval(WINDOWS_SMOKE_USER_DATA)
  const child = launchPackagedApp(
    join(WINDOWS_SMOKE_INSTALL_DIR, 'medresearch-agent.exe'),
    packagedSmokeEnv(process.env, {
      configRoot: WINDOWS_SMOKE_CONFIG_ROOT,
      userData: WINDOWS_SMOKE_USER_DATA,
      logFile: WINDOWS_SMOKE_LOG_FILE
    })
  )
  return finish({
    child,
    logFile: WINDOWS_SMOKE_LOG_FILE,
    stdoutPath: 'D:\\DRA Test\\stdout.log',
    stderrPath: 'D:\\DRA Test\\stderr.log',
    timeoutMs,
    workspaceLogs,
    label,
    userData: WINDOWS_SMOKE_USER_DATA
  })
}

export const runPackagedStartupSmoke = async (options) => {
  if (process.platform === 'win32') return runWindows(options)
  if (process.platform === 'darwin') return runMac(options)
  throw new Error('Packaged startup smoke runs on Windows and macOS runners.')
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  try {
    const timeoutText = argumentValue(process.argv, '--timeout-ms') ?? '240000'
    if (!/^\d+$/.test(timeoutText)) throw new Error('--timeout-ms must be a positive integer.')
    const code = await runPackagedStartupSmoke({
      artifactDir: resolve(argumentValue(process.argv, '--artifact-dir') ?? 'packaged'),
      timeoutMs: Number(timeoutText),
      workspaceLogs: resolve('startup-logs'),
      label: process.env.SMOKE_PLATFORM_LABEL || process.platform
    })
    process.exit(code)
  } catch (error) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
    mkdirSync(resolve('startup-logs'), { recursive: true })
    writeFileSync(resolve('startup-logs/result.txt'), `launch-failed\n${message}\n`)
    process.stderr.write(`${message}\n`)
    process.exit(1)
  }
}
