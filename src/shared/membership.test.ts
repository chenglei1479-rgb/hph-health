import { expect, it } from 'vitest'
import {
  membershipAllows,
  membershipFromVerifiedClaim,
  membershipFeatureForChannel
} from './membership'
import { isExpectedRunFailure } from './run-error-classification'
it('requires an active, finite future grant and downgrades expired or malformed claims', () => {
  const now = Date.now()
  for (const claim of [
    undefined,
    'pro',
    { plan: 'pro' },
    { plan: 'pro', status: 'active', validUntil: Infinity },
    { plan: 'pro', status: 'canceled', validUntil: now + 1000 },
    { plan: 'enterprise', status: 'active', validUntil: now + 1000 }
  ])
    expect(membershipFromVerifiedClaim(claim, now).plan).toBe('free')
  expect(
    membershipFromVerifiedClaim({ plan: 'plus', status: 'active', validUntil: now + 1000 }, now)
      .plan
  ).toBe('plus')
  expect(
    membershipFromVerifiedClaim({ plan: 'pro', status: 'active', validUntil: now }, now)
  ).toMatchObject({ plan: 'free', status: 'expired' })
})
it('applies cumulative privileges and keeps viewing and cancellation out of paid gates', () => {
  expect(membershipAllows({ plan: 'free', status: 'free' }, 'notebook-execution')).toBe(false)
  expect(membershipAllows({ plan: 'pro', status: 'expired' }, 'multi-agent')).toBe(false)
  expect(membershipAllows({ plan: 'plus', status: 'active' }, 'notebook-execution')).toBe(true)
  expect(membershipAllows({ plan: 'plus', status: 'active' }, 'multi-agent')).toBe(false)
  expect(membershipAllows({ plan: 'pro', status: 'active' }, 'research-package')).toBe(true)
  expect(membershipFeatureForChannel('sessions:export-package')).toBe('research-package')
  expect(membershipFeatureForChannel('reviewer:run')).toBe('ai-review')
  for (const channel of ['notebook:state', 'notebook:cancel-background-run', 'sessions:list'])
    expect(membershipFeatureForChannel(channel)).toBeUndefined()
})
it('classifies only supported membership requirement codes as expected failures', () => {
  expect(isExpectedRunFailure('Error: DRA_MEMBERSHIP_REQUIRED:plus:notebook-execution')).toBe(true)
  expect(isExpectedRunFailure('DRA_MEMBERSHIP_REQUIRED:pro:multi-agent')).toBe(true)
  expect(isExpectedRunFailure('DRA_MEMBERSHIP_REQUIRED:pro:multi-agent-corrupt')).toBe(false)
  expect(isExpectedRunFailure('DRA_MEMBERSHIP_REQUIRED:enterprise:unknown')).toBe(false)
})
