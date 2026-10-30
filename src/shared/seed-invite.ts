export const SEED_COMPANY_PROVIDER_ID = 'seed-company-openai'
export const SEED_COMPANY_MODEL = 'gpt-5.4-mini'
export const SEED_PACKAGE_LIMIT = 2

// User-visible seed-invite copy lives in the renderer locale catalogs (t()), not here: it has to
// follow the app language, and this module is imported by the main process too.
export type SeedKeyMode = 'company' | 'byok' | 'none'
export type SeedInviteStatus = {
  mode: SeedKeyMode
  redeemed: boolean
  packagesUsed: number
  packagesRemaining: number
  exhausted: boolean
  maskedKey?: string
}

export const seedStatus = (input: {
  redeemedAt?: number
  packagesUsed?: number
  companyProviderActive: boolean
  byokProviderActive: boolean
  maskedKey?: string
}): SeedInviteStatus => {
  const packagesUsed = Math.max(0, Math.min(SEED_PACKAGE_LIMIT, input.packagesUsed ?? 0))
  const mode: SeedKeyMode = input.companyProviderActive
    ? 'company'
    : input.byokProviderActive
      ? 'byok'
      : 'none'
  return {
    mode,
    redeemed: input.redeemedAt !== undefined,
    packagesUsed,
    packagesRemaining: SEED_PACKAGE_LIMIT - packagesUsed,
    exhausted: packagesUsed >= SEED_PACKAGE_LIMIT,
    ...(input.maskedKey ? { maskedKey: input.maskedKey } : {})
  }
}

export type SeedUsageKind = 'abstract-draft' | 'abstract-revision' | 'demo' | 'literature' | 'other'
export const seedUsageIsFree = (kind: SeedUsageKind): boolean =>
  kind === 'demo' || kind === 'literature'

// A fresh status for profiles and backends predating seed invites. No key is active.
export const createDefaultSeedInviteStatus = (): SeedInviteStatus =>
  seedStatus({ companyProviderActive: false, byokProviderActive: false })
