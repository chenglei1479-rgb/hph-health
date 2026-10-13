import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
const { prepareMembership } = createRequire(import.meta.url)('./admin-membership.cjs')
const now = Date.parse('2026-01-31T12:00:00.000Z')
const request = { action: 'activate', plan: 'plus', months: 1, operator: 'test-administrator' }
it('prepares calendar-month activation without mutating metadata or losing unrelated fields', () => {
  const original = { department: 'test' }
  const result = prepareMembership(original, request, now)
  expect(original).toEqual({ department: 'test' })
  expect(result.department).toBe('test')
  expect(result.dra_membership.valid_until).toBe('2026-02-28T12:00:00.000Z')
  expect(result.dra_membership_history).toHaveLength(1)
})
it('extends an active term from its expiry and starts an expired term at the current timestamp', () => {
  const original = prepareMembership({}, request, now)
  const renewed = prepareMembership(original, { ...request, action: 'renew' }, now + 1000)
  expect(renewed.dra_membership.valid_until).toBe('2026-03-28T12:00:00.000Z')
  expect(renewed.dra_membership_history).toHaveLength(2)
  const late = Date.parse('2026-04-15T09:00:00.000Z')
  expect(
    prepareMembership(original, { ...request, action: 'renew' }, late).dra_membership.valid_until
  ).toBe('2026-05-15T09:00:00.000Z')
})
it('requires explicit plan changes and records manual revocation without deleting history', () => {
  const plus = prepareMembership({}, request, now)
  expect(() => prepareMembership(plus, { ...request, action: 'renew', plan: 'pro' }, now)).toThrow(
    'Use change'
  )
  const pro = prepareMembership(plus, { ...request, action: 'change', plan: 'pro' }, now + 1000)
  const free = prepareMembership(pro, { ...request, action: 'revoke' }, now + 2000)
  expect(free.dra_membership.status).toBe('canceled')
  expect(free.dra_membership_history).toHaveLength(3)
})
it('rejects invalid administrator proposals and refuses to overwrite active terms with activation', () => {
  const active = prepareMembership({}, request, now)
  expect(() => prepareMembership(active, request, now)).toThrow('Existing membership')
  for (const extra of [
    { months: 0 },
    { months: 13 },
    { months: 1.5 },
    { plan: 'enterprise' },
    { operator: '' },
    { action: 'buy' }
  ])
    expect(() => prepareMembership({}, { ...request, ...extra }, now)).toThrow()
  expect(() => prepareMembership({ dra_membership_history: {} }, request, now)).toThrow('history')
})
