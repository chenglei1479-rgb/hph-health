import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { BETA_TERMS_VERSION, hasCurrentBetaTermsAcceptance } from '../../shared/beta-terms'
import { toSettingsPreferencesSnapshot } from './preferences'
import { SettingsRepository } from './repository'

describe('smoke seed', () => {
  it('projects acceptance', async () => {
    const root = await mkdtemp(join(tmpdir(), 'smoke-seed-'))
    await writeFile(
      join(root, 'settings.json'),
      `${JSON.stringify({
        version: 2,
        providers: [],
        onboardingCompletedAt: 1,
        betaTermsAcceptance: { version: BETA_TERMS_VERSION, acceptedAt: 1 },
        dataRoot: root
      })}\n`
    )
    const stored = await new SettingsRepository(root).getSettings()
    const prefs = toSettingsPreferencesSnapshot(stored)
    expect(prefs.betaTermsAcceptance).toEqual({
      version: BETA_TERMS_VERSION,
      acceptedAt: 1
    })
    expect(hasCurrentBetaTermsAcceptance(prefs.betaTermsAcceptance)).toBe(true)
  })
})
