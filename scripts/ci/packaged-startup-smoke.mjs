/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { spawn, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  writeSync
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DRA_HOME_READY_LINE,
  DRA_LOGIN_READY_LINE,
  waitForPackagedStartup
} from './wait-for-packaged-startup.mjs'

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

// macos-14 can leave diskimages-helper wedged, and hdiutil attach then never returns.
// A private mountpoint plus -noverify avoids the /Volumes arbitration dialog. The timeouts
// stay under the 40-minute smoke job so a hang fails with a log instead of a cancellation.
export const MAC_DMG_ATTACH_TIMEOUT_MS = 180_000
export const MAC_DMG_DETACH_TIMEOUT_MS = 30_000
export const MAC_DITTO_TIMEOUT_MS = 12 * 60_000

export const macDmgAttachArgs = (dmg, mountpoint) => [
  'attach',
  '-nobrowse',
  '-readonly',
  '-noverify',
  '-noautoopen',
  '-mountpoint',
  mountpoint,
  dmg
]

export const macDmgDetachArgs = (mountpoint) => ['detach', '-force', mountpoint]

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

// Auth and the prerelease bypass must not leak into the signed-out launch. A beta still
// reaches home when the package itself is a prerelease; a production package must reach login.
const SIGNED_OUT_ENV_KEYS = [
  'DRA_PRERELEASE',
  'DRA_AUTH_MODE',
  'DRA_AUTH_ISSUER',
  'DRA_AUTH_CLIENT_ID',
  'DRA_AUTH_AUDIENCE',
  'DRA_AUTH_ORGANIZATION',
  'DRA_AUTH_CALLBACK_PORT',
  'DRA_AUTH_GOOGLE_CONNECTION',
  'DRA_AUTH_MICROSOFT_CONNECTION',
  'DRA_AUTH_APPLE_CONNECTION',
  'DRA_AUTH_INSTITUTION_CONNECTION'
]

export const signedOutSmokeEnv = (base, paths) => {
  const env = packagedSmokeEnv(base, paths)
  for (const key of SIGNED_OUT_ENV_KEYS) delete env[key]
  return env
}

// An upgraded beta.10 profile already has a workspace history file next to settings.
export const beta10ResearchHistoryJson = () => '{"session":"retained"}\n'

export const SIGNED_OUT_READY_LINES = [DRA_HOME_READY_LINE, DRA_LOGIN_READY_LINE]

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

const note = (message) => {
  writeSync(1, `${message}\n`)
}

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited ${result.status ?? 'null'}.`)
  }
}

const runBounded = (command, args, timeoutMs) => {
  note(`+ ${command} ${args.join(' ')}`)
  const started = Date.now()
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: timeoutMs,
    killSignal: 'SIGKILL'
  })
  note(
    `- ${command} status ${result.status ?? 'null'} signal ${result.signal ?? 'none'} in ${Date.now() - started}ms`
  )
  if (result.error && result.error.code !== 'ETIMEDOUT') throw result.error
  if (result.error || result.status !== 0) {
    const detail = `${result.stderr || ''}${result.stdout || ''}`.trim()
    const why =
      result.error?.code === 'ETIMEDOUT'
        ? `timed out after ${timeoutMs}ms`
        : `exited ${result.status ?? 'null'}`
    throw new Error(`${command} ${why}.${detail ? ` ${detail}` : ''}`)
  }
  return result
}

const releaseDiskImages = (mountpoint) => {
  spawnSync('pkill', ['-9', 'diskimages-helper'], { stdio: 'ignore' })
  spawnSync('hdiutil', macDmgDetachArgs(mountpoint), {
    stdio: 'ignore',
    timeout: MAC_DMG_DETACH_TIMEOUT_MS,
    killSignal: 'SIGKILL'
  })
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

const seedBeta10UserData = ({ configRoot, dataRoot, userData }) => {
  writeSmokeSettings(configRoot, dataRoot)
  mkdirSync(userData, { recursive: true })
  seedDeclinedMachineApproval(userData)
  const history = join(dataRoot, 'workspaces', 'history.json')
  mkdirSync(dirname(history), { recursive: true })
  writeFileSync(history, beta10ResearchHistoryJson())
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

const signedOutPaths = (paths) => ({
  configRoot: `${paths.configRoot} signed-out`,
  dataRoot: `${paths.dataRoot} signed-out`,
  userData: `${paths.userData} signed-out`,
  logFile: join(dirname(paths.logFile), 'startup-signed-out.log'),
  stdoutPath: join(dirname(paths.stdoutPath), 'stdout-signed-out.log'),
  stderrPath: join(dirname(paths.stderrPath), 'stderr-signed-out.log')
})

const launchRecorded = async ({
  binary,
  env,
  logFile,
  stdoutPath,
  stderrPath,
  timeoutMs,
  workspaceLogs,
  label,
  userData,
  readyLines,
  rejectAccountLoginAtHome = false
}) => {
  note(`Launching ${binary} (${label}).`)
  const child = launchPackagedApp(binary, env)
  return finish({
    child,
    logFile,
    stdoutPath,
    stderrPath,
    timeoutMs,
    workspaceLogs,
    label,
    userData,
    readyLines,
    rejectAccountLoginAtHome
  })
}

// Home plus "login required" means the splash was dismissed while the backend is still
// signed-out. A real sign-in screen is allowed; a beta local-mode home is not.
export const rejectHomeThatStillRequiredLogin = (userData, result) => {
  if (!result.ok || !result.detail?.includes(DRA_HOME_READY_LINE)) return result
  if (result.detail.includes(DRA_LOGIN_READY_LINE)) return result
  const logs = [join(userData, 'desktop-logs', 'main.log'), join(userData, 'logs', 'main.log')]
  for (const file of logs) {
    let text = ''
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    if (text.includes('DRA account login required')) {
      return {
        ok: false,
        reason: 'login-required',
        detail: `${result.detail}\n${text}`
      }
    }
  }
  return result
}

const launchPrereleaseThenSignedOut = async ({
  binary,
  paths,
  timeoutMs,
  workspaceLogs,
  label
}) => {
  writeSmokeSettings(paths.configRoot, paths.dataRoot)
  mkdirSync(paths.userData, { recursive: true })
  seedDeclinedMachineApproval(paths.userData)
  const homeCode = await launchRecorded({
    binary,
    env: packagedSmokeEnv(process.env, paths),
    logFile: paths.logFile,
    stdoutPath: paths.stdoutPath,
    stderrPath: paths.stderrPath,
    timeoutMs,
    workspaceLogs,
    label: `${label} prerelease`,
    userData: paths.userData
  })
  if (homeCode !== 0) return homeCode
  const signedOut = signedOutPaths(paths)
  seedBeta10UserData(signedOut)
  return launchRecorded({
    binary,
    env: signedOutSmokeEnv(process.env, signedOut),
    logFile: signedOut.logFile,
    stdoutPath: signedOut.stdoutPath,
    stderrPath: signedOut.stderrPath,
    timeoutMs,
    workspaceLogs: join(workspaceLogs, 'signed-out'),
    label: `${label} signed-out`,
    userData: signedOut.userData,
    readyLines: SIGNED_OUT_READY_LINES,
    rejectAccountLoginAtHome: true
  })
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
  const reachedLogin = result.detail?.includes(DRA_LOGIN_READY_LINE)
  const line =
    result.reason === 'ready'
      ? `${label} reached ${reachedLogin ? 'the login screen' : 'the home window'}.`
      : `${label} did not reach home or the login screen (${result.reason}).`
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
  userData,
  readyLines,
  rejectAccountLoginAtHome = false
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
      extraPaths: [stdoutPath, stderrPath],
      readyLines
    })
  } finally {
    stopPackagedApp(child.pid)
    mirrorLog(logFile, join(workspaceLogs, 'startup.log'))
    mirrorLog(stdoutPath, join(workspaceLogs, 'stdout.log'))
    mirrorLog(stderrPath, join(workspaceLogs, 'stderr.log'))
    if (userData) mirrorAppLogs(userData, workspaceLogs)
  }
  if (rejectAccountLoginAtHome && userData)
    result = rejectHomeThatStillRequiredLogin(userData, result)
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

const attachDmg = (dmg, mountpoint) => {
  let lastError = new Error('hdiutil attach failed.')
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    rmSync(mountpoint, { recursive: true, force: true })
    mkdirSync(mountpoint, { recursive: true })
    try {
      note(`Attaching ${dmg} at ${mountpoint} (attempt ${attempt}).`)
      runBounded('hdiutil', macDmgAttachArgs(dmg, mountpoint), MAC_DMG_ATTACH_TIMEOUT_MS)
      return mountpoint
    } catch (error) {
      lastError = error
      note(`hdiutil attach failed: ${error instanceof Error ? error.message : String(error)}`)
      releaseDiskImages(mountpoint)
    }
  }
  throw lastError
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
  const mount = join(process.env.RUNNER_TEMP || tmpdir(), 'dra-smoke-dmg')
  attachDmg(dmg, mount)
  try {
    const mountedApp = readdirSync(mount).find((name) => name.endsWith('.app'))
    if (!mountedApp) throw new Error(`The disk image has no application bundle: ${mount}`)
    paths.app = join(homedir(), 'Applications', 'DRA Test', mountedApp)
    mkdirSync(dirname(paths.app), { recursive: true })
    runBounded('ditto', [join(mount, mountedApp), paths.app], MAC_DITTO_TIMEOUT_MS)
  } finally {
    try {
      runBounded('hdiutil', macDmgDetachArgs(mount), MAC_DMG_DETACH_TIMEOUT_MS)
    } catch (error) {
      note(`hdiutil detach failed: ${error instanceof Error ? error.message : String(error)}`)
      releaseDiskImages(mount)
    }
  }
  clearQuarantine(paths.app)
  const macOsDir = join(paths.app, 'Contents', 'MacOS')
  const executableName = readdirSync(macOsDir).find((name) => !name.startsWith('.'))
  if (!executableName) throw new Error(`The application bundle has no executable: ${macOsDir}`)
  const binary = join(macOsDir, executableName)
  assertMacArchitecture(binary)
  return launchPrereleaseThenSignedOut({ binary, paths, timeoutMs, workspaceLogs, label })
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
  return launchPrereleaseThenSignedOut({
    binary: join(WINDOWS_SMOKE_INSTALL_DIR, 'medresearch-agent.exe'),
    paths: {
      configRoot: WINDOWS_SMOKE_CONFIG_ROOT,
      dataRoot: WINDOWS_SMOKE_DATA_ROOT,
      userData: WINDOWS_SMOKE_USER_DATA,
      logFile: WINDOWS_SMOKE_LOG_FILE,
      stdoutPath: 'D:\\DRA Test\\stdout.log',
      stderrPath: 'D:\\DRA Test\\stderr.log'
    },
    timeoutMs,
    workspaceLogs,
    label
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
