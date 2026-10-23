import type { OfficialMarketplaceSourceConfig } from '../specialist/marketplace/service'
import { OFFICIAL_SKILL_MARKETPLACE_SOURCE } from '../skill-marketplace/source'
import { OFFICIAL_MARKETPLACE_SOURCE } from '../specialist/marketplace/official-source'

// The official marketplaces stay enabled by default (Leo, 2026-10-17). The explicit switch exists
// so an operator can turn them off without a code change; a disabled marketplace makes no request
// and leaves installed Skills/Specialists usable.
const disabled = (env: NodeJS.ProcessEnv, name: string): boolean => env[name] === '1'

export const officialSkillMarketplaceSource = (
  env = process.env
): typeof OFFICIAL_SKILL_MARKETPLACE_SOURCE | undefined =>
  disabled(env, 'OPEN_SCIENCE_SKILL_MARKETPLACE_DISABLED')
    ? undefined
    : OFFICIAL_SKILL_MARKETPLACE_SOURCE

export const officialSpecialistMarketplaceSource = (
  env = process.env
): OfficialMarketplaceSourceConfig | undefined =>
  disabled(env, 'OPEN_SCIENCE_SPECIALIST_MARKETPLACE_DISABLED')
    ? undefined
    : OFFICIAL_MARKETPLACE_SOURCE
