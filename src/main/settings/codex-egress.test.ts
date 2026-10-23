import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { prepareCodexRuntimeHomeAuthentication, serializeCodexEgressPolicy } from './codex-auth'

const createRoot = async (): Promise<string> => mkdtemp(join(tmpdir(), 'codex-egress-'))

describe('serializeCodexEgressPolicy', () => {
  it('forces analytics, update checks, and feedback off', () => {
    const config = serializeCodexEgressPolicy('cli_auth_credentials_store = "ephemeral"\n')

    expect(config).toContain('check_for_update_on_startup = false')
    expect(config).toContain('[analytics]')
    expect(config).toContain('enabled = false')
    expect(config).toContain('[feedback]')
    // The top-level assignment must precede the first table, and the blocked tables are last.
    expect(config.indexOf('check_for_update_on_startup')).toBeLessThan(
      config.indexOf('[analytics]')
    )
  })

  it('replaces user-authored analytics/feedback values instead of merging them', () => {
    const config = serializeCodexEgressPolicy(
      [
        'check_for_update_on_startup = true',
        'model = "gpt-5"',
        '',
        '[analytics]',
        'enabled = true',
        '',
        '[feedback]',
        'enabled = true',
        '',
        '[profiles.default]',
        'model = "gpt-5"'
      ].join('\n')
    )

    expect(config).not.toContain('check_for_update_on_startup = true')
    expect(config.match(/\[analytics\]/g)).toHaveLength(1)
    expect(config.match(/\[feedback\]/g)).toHaveLength(1)
    expect(config).toContain('[profiles.default]')
    expect(config.match(/enabled = true/g)).toBeNull()
  })

  it('is idempotent', () => {
    const once = serializeCodexEgressPolicy('model = "gpt-5"\n')
    const twice = serializeCodexEgressPolicy(once)
    expect(twice).toBe(once)
  })
})

describe('Codex runtime home', () => {
  it('writes the forced egress policy into every prepared runtime home', async () => {
    const root = await createRoot()
    const runtimeHome = join(root, 'runtime')

    await prepareCodexRuntimeHomeAuthentication({
      runtimeHome,
      useSubscriptionAuthentication: false
    })

    const config = await readFile(join(runtimeHome, 'config.toml'), 'utf8')
    expect(config).toContain('check_for_update_on_startup = false')
    expect(config).toContain('[analytics]')
    expect(config).toContain('[feedback]')
    expect(config).toContain('enabled = false')
  })

  it('keeps the forced policy when an existing config has stale values', async () => {
    const root = await createRoot()
    const runtimeHome = join(root, 'runtime')
    await mkdir(runtimeHome, { recursive: true })
    await writeFile(join(runtimeHome, 'config.toml'), '[analytics]\nenabled = true\n')

    await prepareCodexRuntimeHomeAuthentication({
      runtimeHome,
      useSubscriptionAuthentication: false
    })

    const config = await readFile(join(runtimeHome, 'config.toml'), 'utf8')
    expect(config).not.toContain('enabled = true')
  })
})
