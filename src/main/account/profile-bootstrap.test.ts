import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { configureAccountProfile } from './profile-bootstrap'
import { resolveBootstrapConfigRoot } from '../storage/config-root'
import { resolveElectronProfile } from '../storage/electron-profile'

it('isolates configuration, default data and Electron cookies for two profiles', () => {
  const root = mkdtempSync(join(tmpdir(), 'dra-profiles-'))
  try {
    const a: NodeJS.ProcessEnv = { DRA_PROFILES_ROOT: root }
    const b: NodeJS.ProcessEnv = { DRA_PROFILES_ROOT: root }
    configureAccountProfile(['--dra-profile=doctor-a'], root, a)
    configureAccountProfile(['--dra-profile=doctor-b'], root, b)
    expect(a.OPEN_SCIENCE_CONFIG_ROOT).not.toBe(b.OPEN_SCIENCE_CONFIG_ROOT)
    expect(resolveBootstrapConfigRoot(root, true, a)).toBe(a.OPEN_SCIENCE_CONFIG_ROOT)
    expect(
      resolveElectronProfile({
        appData: root,
        configRoot: a.OPEN_SCIENCE_CONFIG_ROOT!,
        packaged: true,
        env: a
      })
    ).not.toBe(
      resolveElectronProfile({
        appData: root,
        configRoot: b.OPEN_SCIENCE_CONFIG_ROOT!,
        packaged: true,
        env: b
      })
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
it('keeps local profiles distinct and rejects traversal or conflicting storage overrides', () => {
  const root = mkdtempSync(join(tmpdir(), 'dra-profiles-'))
  try {
    const env: NodeJS.ProcessEnv = { DRA_PROFILES_ROOT: root }
    configureAccountProfile(['--dra-profile=local-doctor-a', '--dra-local'], root, env)
    expect(env.DRA_AUTH_MODE).toBe('local')
    for (const args of [
      ['--dra-profile=../a'],
      ['--dra-profile=doctor-a', '--dra-local'],
      ['--dra-profile=local-a']
    ]) {
      expect(() => configureAccountProfile(args, root, { DRA_PROFILES_ROOT: root })).toThrow()
    }
    expect(() =>
      configureAccountProfile(['--dra-profile=doctor-a'], root, { OPEN_SCIENCE_USER_DATA: root })
    ).toThrow()
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
