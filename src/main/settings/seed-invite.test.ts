import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SEED_COMPANY_MODEL, SEED_COMPANY_PROVIDER_ID } from '../../shared/seed-invite'
import { SettingsRepository } from './repository'

describe('seed invite settings authority', () => {
  it('redeems once, activates the pinned company provider, and atomically caps two packages', async () => {
    const root = await mkdtemp(join(tmpdir(), 'seed-invite-'))
    const repository = new SettingsRepository(root)
    const input = {
      redeemedAt: 1,
      redeemedCodeHash: 'a'.repeat(64),
      companyKeyRef: 'enc:opaque',
      companyKeyMask: '••••1234',
      provider: {
        id: SEED_COMPANY_PROVIDER_ID,
        type: 'official' as const,
        vendorId: 'openai' as const,
        name: 'シード招待枠',
        model: SEED_COMPANY_MODEL,
        keyRef: 'enc:opaque',
        keyMask: '••••1234'
      }
    }

    const redeemed = await repository.redeemSeedInvite(input)
    expect(redeemed).toMatchObject({
      activeProviderId: SEED_COMPANY_PROVIDER_ID,
      activeModel: SEED_COMPANY_MODEL,
      seedInvite: { packagesUsed: 0, companyKeyMask: '••••1234' }
    })
    await expect(repository.redeemSeedInvite(input)).rejects.toThrow('already been redeemed')
    expect((await repository.consumeSeedPackage()).seedInvite?.packagesUsed).toBe(1)
    expect((await repository.consumeSeedPackage()).seedInvite?.packagesUsed).toBe(2)
    await expect(repository.consumeSeedPackage()).rejects.toThrow('seed-invite-exhausted')
  })

  it('does not consume the seed allowance while BYOK is active', async () => {
    const root = await mkdtemp(join(tmpdir(), 'seed-invite-byok-'))
    const repository = new SettingsRepository(root)
    await repository.redeemSeedInvite({
      redeemedAt: 1,
      redeemedCodeHash: 'b'.repeat(64),
      companyKeyRef: 'enc:opaque',
      companyKeyMask: '••••1234',
      provider: {
        id: SEED_COMPANY_PROVIDER_ID,
        type: 'official',
        vendorId: 'openai',
        name: 'シード招待枠',
        model: SEED_COMPANY_MODEL,
        keyRef: 'enc:opaque'
      }
    })
    await repository.upsertProvider({
      id: 'byok-openai',
      type: 'official',
      vendorId: 'openai',
      name: 'BYOK',
      model: 'gpt-5.4-mini',
      keyRef: 'enc:byok'
    })
    await repository.setActiveProvider('byok-openai', 'gpt-5.4-mini')
    expect((await repository.consumeSeedPackage()).seedInvite?.packagesUsed).toBe(0)
  })
})
