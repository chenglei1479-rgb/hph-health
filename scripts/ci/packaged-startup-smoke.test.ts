import { expect, it } from 'vitest'

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  MAC_DITTO_TIMEOUT_MS,
  MAC_DMG_ATTACH_TIMEOUT_MS,
  MAC_DMG_DETACH_TIMEOUT_MS,
  SIGNED_OUT_READY_LINES,
  SMOKE_BETA_TERMS_VERSION,
  WINDOWS_SMOKE_INSTALL_DIR,
  beta10ResearchHistoryJson,
  declinedMachineApprovalLine,
  rejectHomeThatStillRequiredLogin,
  macDmgAttachArgs,
  macDmgDetachArgs,
  macQuarantineClearCommand,
  packagedSmokeEnv,
  signedOutSmokeEnv,
  smokeSettingsJson,
  windowsSilentInstallArgs,
  windowsSilentInstallCommand
} from './packaged-startup-smoke.mjs'
import {
  DRA_HOME_READY_LINE,
  DRA_LOGIN_READY_LINE,
  DRA_ONBOARDING_READY_LINE,
  DRA_TERMS_READY_LINE
} from './wait-for-packaged-startup.mjs'
import { BETA_TERMS_VERSION } from '../../src/shared/beta-terms'

it('keeps the smoke-seeded beta terms version aligned with the app', () => {
  expect(SMOKE_BETA_TERMS_VERSION).toBe(BETA_TERMS_VERSION)
})

it('installs the Windows beta on a non-C: path that contains a space', () => {
  const setup = 'C:\\runner\\work\\DRA setup.exe'
  const command = windowsSilentInstallCommand(setup)
  expect(command).toBe(
    'cmd.exe /d /s /c ""C:\\runner\\work\\DRA setup.exe" /S /D=D:\\DRA Test\\medresearch-agent"'
  )
  expect(command.endsWith(`/S /D=${WINDOWS_SMOKE_INSTALL_DIR}"`)).toBe(true)
  expect(command).not.toContain('"/D=')
  expect(windowsSilentInstallArgs(setup)[3]).toContain('/D=D:\\DRA Test\\medresearch-agent')
})

it('mounts the dmg on a private path before diskimages-helper can hang the job', () => {
  expect(macDmgAttachArgs('/tmp/DRA.dmg', '/tmp/dra-smoke-dmg')).toEqual([
    'attach',
    '-nobrowse',
    '-readonly',
    '-noverify',
    '-noautoopen',
    '-mountpoint',
    '/tmp/dra-smoke-dmg',
    '/tmp/DRA.dmg'
  ])
  expect(macDmgDetachArgs('/tmp/dra-smoke-dmg')).toEqual(['detach', '-force', '/tmp/dra-smoke-dmg'])
  // Two attach attempts, one copy, and one detach must finish inside the 40-minute smoke job.
  expect(
    MAC_DMG_ATTACH_TIMEOUT_MS * 2 + MAC_DITTO_TIMEOUT_MS + MAC_DMG_DETACH_TIMEOUT_MS
  ).toBeLessThan(40 * 60 * 1000)
})

it('clears only the quarantine attribute a right-click Open would remove', () => {
  expect(macQuarantineClearCommand('/Users/doctor/Applications/DRA Test/DRA.app')).toEqual([
    'xattr',
    '-dr',
    'com.apple.quarantine',
    '/Users/doctor/Applications/DRA Test/DRA.app'
  ])
})

it('seeds completed onboarding and launches the packaged app in prerelease mode', () => {
  expect(JSON.parse(smokeSettingsJson('/Users/doctor/DRA Test/MedResearchAgent'))).toEqual({
    version: 2,
    providers: [],
    seedInvite: {
      mode: 'none',
      redeemed: false,
      packagesUsed: 0,
      packagesRemaining: 2,
      exhausted: false
    },
    onboardingCompletedAt: 1,
    betaTermsAcceptance: { version: BETA_TERMS_VERSION, acceptedAt: 1 },
    dataRoot: '/Users/doctor/DRA Test/MedResearchAgent'
  })
  const env = packagedSmokeEnv(
    { PATH: '/usr/bin', ELECTRON_RUN_AS_NODE: '1', DRA_PRERELEASE: '0' },
    {
      configRoot: '/Users/doctor/DRA Test/config root',
      userData: '/Users/doctor/DRA Test/user data',
      logFile: '/Users/doctor/DRA Test/startup.log'
    }
  )
  expect(env.DRA_PRERELEASE).toBe('1')
  expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined()
  expect(env.PATH).toBe('/usr/bin')
  expect(env.OPEN_SCIENCE_CONFIG_ROOT).toContain('config root')
  expect(env.DRA_STARTUP_LOG_FILE).toContain('startup.log')
})

it('launches signed-out over beta.10 user data without the prerelease bypass', () => {
  const paths = {
    configRoot: '/Users/doctor/DRA Test/config root',
    userData: '/Users/doctor/DRA Test/user data',
    logFile: '/Users/doctor/DRA Test/startup.log'
  }
  const env = signedOutSmokeEnv(
    {
      PATH: '/usr/bin',
      DRA_PRERELEASE: '1',
      DRA_AUTH_MODE: 'test',
      DRA_AUTH_ISSUER: 'https://tenant.example/',
      DRA_AUTH_CLIENT_ID: 'client'
    },
    paths
  )
  expect(env.DRA_PRERELEASE).toBeUndefined()
  expect(env.DRA_AUTH_MODE).toBeUndefined()
  expect(env.DRA_AUTH_ISSUER).toBeUndefined()
  expect(env.DRA_AUTH_CLIENT_ID).toBeUndefined()
  expect(env.PATH).toBe('/usr/bin')
  expect(env.OPEN_SCIENCE_CONFIG_ROOT).toBe(paths.configRoot)
  expect(env.OPEN_SCIENCE_USER_DATA).toBe(paths.userData)
  expect(JSON.parse(beta10ResearchHistoryJson())).toEqual({ session: 'retained' })
  expect(SIGNED_OUT_READY_LINES).toEqual([
    DRA_HOME_READY_LINE,
    DRA_LOGIN_READY_LINE,
    DRA_TERMS_READY_LINE,
    DRA_ONBOARDING_READY_LINE
  ])
  const source = readFileSync(new URL('./packaged-startup-smoke.mjs', import.meta.url), 'utf8')
  expect(source).toContain('signedOutSmokeEnv(')
  expect(source).toContain('seedBeta10UserData(')
  expect(source).toContain('readyLines: SIGNED_OUT_READY_LINES')
  expect(source).toContain('rejectAccountLoginAtHome: true')
})

it('rejects a home window that still logged account login required', () => {
  const userData = join(tmpdir(), `dra-signed-out-${process.pid}`)
  mkdirSync(join(userData, 'desktop-logs'), { recursive: true })
  const ready = { ok: true, reason: 'ready', detail: `${DRA_HOME_READY_LINE}\n` }
  writeFileSync(
    join(userData, 'desktop-logs', 'main.log'),
    'desktop operation failed DRA account login required.\n'
  )
  expect(rejectHomeThatStillRequiredLogin(userData, ready)).toMatchObject({
    ok: false,
    reason: 'login-required'
  })
  writeFileSync(join(userData, 'desktop-logs', 'main.log'), 'application-startup completed\n')
  expect(rejectHomeThatStillRequiredLogin(userData, ready)).toEqual(ready)
  expect(
    rejectHomeThatStillRequiredLogin(userData, {
      ok: true,
      reason: 'ready',
      detail: `${DRA_LOGIN_READY_LINE}\nDRA account login required\n`
    }).ok
  ).toBe(true)
})

it('records a declined hospital approval so the PHI gate stays closed', () => {
  const record = JSON.parse(declinedMachineApprovalLine())
  expect(record.approved).toBe(false)
  expect(record.approvalNumber).toBeNull()
  expect(record.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/)
})
