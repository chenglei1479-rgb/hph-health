import { describe, expect, it } from 'vitest'
import { SEED_COMPANY_MODEL, seedStatus, seedUsageIsFree } from './seed-invite'

// The user-visible seed-invite copy moved to the renderer locale catalogs; this file covers the
// policy only: the model, the allowance, and which usage kinds are free.
describe('seed invite policy', () => {
  it('pins a mid-tier model', () => {
    expect(SEED_COMPANY_MODEL).toBe('gpt-5.4-mini')
  })
  it('keeps demo and literature outside the two-package allowance', () => {
    expect(seedUsageIsFree('demo')).toBe(true)
    expect(seedUsageIsFree('literature')).toBe(true)
    expect(seedUsageIsFree('abstract-draft')).toBe(false)
    expect(seedUsageIsFree('abstract-revision')).toBe(false)
    expect(
      seedStatus({
        redeemedAt: 1,
        packagesUsed: 2,
        companyProviderActive: true,
        byokProviderActive: false
      })
    ).toMatchObject({ mode: 'company', packagesRemaining: 0, exhausted: true })
  })
  it('reports the active key mode', () => {
    expect(seedStatus({ companyProviderActive: true, byokProviderActive: true }).mode).toBe(
      'company'
    )
    expect(seedStatus({ companyProviderActive: false, byokProviderActive: true }).mode).toBe('byok')
    expect(seedStatus({ companyProviderActive: false, byokProviderActive: false }).mode).toBe(
      'none'
    )
  })
})
