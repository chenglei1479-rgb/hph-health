import { expect, it } from 'vitest'

import {
  WINDOWS_SMOKE_INSTALL_DIR,
  declinedMachineApprovalLine,
  macQuarantineClearCommand,
  packagedSmokeEnv,
  smokeSettingsJson,
  windowsSilentInstallArgs,
  windowsSilentInstallCommand
} from './packaged-startup-smoke.mjs'

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
    onboardingCompletedAt: 1,
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

it('records a declined hospital approval so the PHI gate stays closed', () => {
  const record = JSON.parse(declinedMachineApprovalLine())
  expect(record.approved).toBe(false)
  expect(record.approvalNumber).toBeNull()
  expect(record.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/)
})
