import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  BETA_TERMS_VERSION,
  hasCurrentBetaTermsAcceptance,
  normalizeBetaTermsAcceptance
} from '../../shared/beta-terms'
import { SettingsRepository } from './repository'

const createRoot = async (): Promise<string> => mkdtemp(join(tmpdir(), 'beta-terms-'))

describe('beta terms acceptance', () => {
  it('records the current version and accepted time locally', async () => {
    const root = await createRoot()
    const repository = new SettingsRepository(root)

    await repository.recordBetaTermsAcceptance(BETA_TERMS_VERSION, 1_700_000_000_000)

    const stored = await new SettingsRepository(root).getSettings()
    expect(stored.betaTermsAcceptance).toEqual({
      version: BETA_TERMS_VERSION,
      acceptedAt: 1_700_000_000_000
    })
  })

  it('is idempotent for the same version', async () => {
    const root = await createRoot()
    const repository = new SettingsRepository(root)

    await repository.recordBetaTermsAcceptance(BETA_TERMS_VERSION, 100)
    await repository.recordBetaTermsAcceptance(BETA_TERMS_VERSION, 200)

    expect((await repository.getSettings()).betaTermsAcceptance).toEqual({
      version: BETA_TERMS_VERSION,
      acceptedAt: 100
    })
  })

  it('replaces the record when the terms version changes', async () => {
    const root = await createRoot()
    const repository = new SettingsRepository(root)

    await repository.recordBetaTermsAcceptance('2026-10-β0', 100)
    await repository.recordBetaTermsAcceptance(BETA_TERMS_VERSION, 200)

    expect((await repository.getSettings()).betaTermsAcceptance).toEqual({
      version: BETA_TERMS_VERSION,
      acceptedAt: 200
    })
  })

  it('rejects an empty version or an invalid timestamp', async () => {
    const repository = new SettingsRepository(await createRoot())
    await expect(repository.recordBetaTermsAcceptance('  ', 1)).rejects.toThrow(/version/i)
    await expect(repository.recordBetaTermsAcceptance(BETA_TERMS_VERSION, -1)).rejects.toThrow(
      /timestamp/i
    )
  })

  it('drops malformed stored values instead of failing startup', async () => {
    const invalid = [
      null,
      'accepted',
      {},
      { version: '', acceptedAt: 1 },
      { version: 'v1', acceptedAt: 'now' },
      { version: 'v1', acceptedAt: Number.NaN },
      { version: 'v1', acceptedAt: -2 }
    ]

    for (const betaTermsAcceptance of invalid) {
      const root = await createRoot()
      await writeFile(
        join(root, 'settings.json'),
        JSON.stringify({ version: 2, providers: [], betaTermsAcceptance })
      )
      const stored = await new SettingsRepository(root).getSettings()
      expect(stored.betaTermsAcceptance).toBeUndefined()
    }
  })

  it('keeps a valid stored value verbatim', async () => {
    const root = await createRoot()
    await writeFile(
      join(root, 'settings.json'),
      JSON.stringify({
        version: 2,
        providers: [],
        betaTermsAcceptance: { version: 'custom', acceptedAt: 42 }
      })
    )

    expect((await new SettingsRepository(root).getSettings()).betaTermsAcceptance).toEqual({
      version: 'custom',
      acceptedAt: 42
    })
    expect(await readFile(join(root, 'settings.json'), 'utf8')).toContain('"betaTermsAcceptance"')
  })
})

describe('beta terms version gate', () => {
  it('accepts only the current version', () => {
    expect(hasCurrentBetaTermsAcceptance(undefined)).toBe(false)
    expect(hasCurrentBetaTermsAcceptance({ version: 'old', acceptedAt: 1 })).toBe(false)
    expect(hasCurrentBetaTermsAcceptance({ version: BETA_TERMS_VERSION, acceptedAt: 1 })).toBe(true)
  })

  it('normalizes only finite, non-negative timestamps and non-empty versions', () => {
    expect(normalizeBetaTermsAcceptance({ version: ' v ', acceptedAt: 0 })).toEqual({
      version: 'v',
      acceptedAt: 0
    })
    expect(normalizeBetaTermsAcceptance({ version: 'v', acceptedAt: Infinity })).toBeUndefined()
    expect(normalizeBetaTermsAcceptance({ version: 'v', acceptedAt: -1 })).toBeUndefined()
  })
})
