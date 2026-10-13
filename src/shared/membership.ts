export const MEMBERSHIP_CLAIM = 'https://github.com/chenglei1479-rgb/hph-health/membership'
export type MembershipPlan = 'free' | 'plus' | 'pro'
export type MembershipFeature =
  'notebook-execution' | 'research-package' | 'multi-agent' | 'background-execution' | 'ai-review'
export type MembershipState = {
  plan: MembershipPlan
  status: 'free' | 'active' | 'expired'
  validUntil?: number
}
export const MEMBERSHIP_PRICES = { free: 0, plus: 20, pro: 100 } as const
export const MEMBERSHIP_MINIMUM: Record<MembershipFeature, MembershipPlan> = {
  'notebook-execution': 'plus',
  'research-package': 'plus',
  'multi-agent': 'pro',
  'background-execution': 'pro',
  'ai-review': 'pro'
}
const rank: Record<MembershipPlan, number> = { free: 0, plus: 1, pro: 2 }
export const membershipAllows = (state: MembershipState, feature: MembershipFeature): boolean =>
  state.status === 'active' && rank[state.plan] >= rank[MEMBERSHIP_MINIMUM[feature]]

export const membershipRequirement = (message: string): 'plus' | 'pro' | undefined =>
  message.match(
    /DRA_MEMBERSHIP_REQUIRED:(plus|pro):(notebook-execution|research-package|multi-agent|background-execution|ai-review)(?=$|[\s.,)])/u
  )?.[1] as 'plus' | 'pro' | undefined

// Call only after issuer, audience, signature, expiry and identity checks have succeeded.
export const membershipFromVerifiedClaim = (claim: unknown, now = Date.now()): MembershipState => {
  if (!claim || typeof claim !== 'object' || Array.isArray(claim))
    return { plan: 'free', status: 'free' }
  const value = claim as Record<string, unknown>
  if (
    (value.plan !== 'plus' && value.plan !== 'pro') ||
    value.status !== 'active' ||
    typeof value.validUntil !== 'number' ||
    !Number.isSafeInteger(value.validUntil) ||
    value.validUntil <= 0
  )
    return { plan: 'free', status: 'free' }
  if (value.validUntil <= now)
    return { plan: 'free', status: 'expired', validUntil: value.validUntil }
  return { plan: value.plan, status: 'active', validUntil: value.validUntil }
}

export const membershipFeatureForChannel = (channel: string): MembershipFeature | undefined => {
  if (channel === 'notebook:execute' || channel === 'notebook:run-cell') return 'notebook-execution'
  if (channel === 'sessions:export-package') return 'research-package'
  if (channel === 'reviewer:run') return 'ai-review'
  return undefined
}
