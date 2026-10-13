import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'
import { MEMBERSHIP_CLAIM } from '../../shared/membership'
import { membershipFromVerifiedClaim, membershipAllows } from '../../shared/membership'
const load = (): ((event: unknown, api: unknown) => Promise<void>) => {
  const exports: Record<string, unknown> = {}
  runInNewContext(readFileSync(resolve('scripts/auth0-membership-action.cjs'), 'utf8'), { exports })
  return exports.onExecutePostLogin as (event: unknown, api: unknown) => Promise<void>
}
it('uses administrator metadata for the intended application and never user-editable metadata', async () => {
  const action = load(),
    setCustomClaim = vi.fn(),
    api = { idToken: { setCustomClaim } }
  const base = { client: { client_id: 'Rh2MZp3aNDrmGLuI3VHsnNI1mG4SPUqf' }, user: {} }
  await action(
    {
      ...base,
      user: {
        user_metadata: {
          dra_membership: {
            plan: 'pro',
            status: 'active',
            valid_until: new Date(Date.now() + 86400000).toISOString()
          }
        }
      }
    },
    api
  )
  expect(setCustomClaim).toHaveBeenLastCalledWith(MEMBERSHIP_CLAIM, {
    plan: 'free',
    status: 'free'
  })
  const valid_until = new Date(Date.now() + 86400000).toISOString()
  await action(
    {
      ...base,
      user: { app_metadata: { dra_membership: { plan: 'plus', status: 'active', valid_until } } }
    },
    api
  )
  expect(setCustomClaim).toHaveBeenLastCalledWith(MEMBERSHIP_CLAIM, {
    plan: 'plus',
    status: 'active',
    validUntil: Date.parse(valid_until)
  })
  setCustomClaim.mockClear()
  await action({ ...base, client: { client_id: 'another-application' } }, api)
  expect(setCustomClaim).not.toHaveBeenCalled()
})
it('fails closed for malformed or expired administrator grants', async () => {
  const action = load(),
    setCustomClaim = vi.fn(),
    api = { idToken: { setCustomClaim } }
  for (const grant of [
    undefined,
    { plan: 'pro', status: 'active', valid_until: 'invalid' },
    { plan: 'pro', status: 'active', valid_until: new Date(0).toISOString() },
    { plan: 'pro', status: 'canceled', valid_until: new Date(Date.now() + 86400000).toISOString() }
  ]) {
    await action(
      {
        client: { client_id: 'Rh2MZp3aNDrmGLuI3VHsnNI1mG4SPUqf' },
        user: { app_metadata: { dra_membership: grant } }
      },
      api
    )
    expect(setCustomClaim).toHaveBeenLastCalledWith(MEMBERSHIP_CLAIM, {
      plan: 'free',
      status: 'free'
    })
  }
})

it('preserves a valid expired deadline for display without granting protected execution', async () => {
  const action = load()
  const setCustomClaim = vi.fn()
  const deadline = Date.now() - 1000
  await action(
    {
      client: { client_id: 'Rh2MZp3aNDrmGLuI3VHsnNI1mG4SPUqf' },
      user: {
        app_metadata: {
          dra_membership: {
            plan: 'pro',
            status: 'active',
            valid_until: new Date(deadline).toISOString()
          }
        }
      }
    },
    { idToken: { setCustomClaim } }
  )
  const state = membershipFromVerifiedClaim(setCustomClaim.mock.calls[0][1])
  expect(state).toEqual({ plan: 'free', status: 'expired', validUntil: deadline })
  expect(membershipAllows(state, 'notebook-execution')).toBe(false)
  expect(membershipAllows(state, 'background-execution')).toBe(false)
})
