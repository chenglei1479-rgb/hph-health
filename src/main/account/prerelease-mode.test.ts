import { afterEach, expect, it, vi } from 'vitest'

import { readAccountConfig } from './config'
import { AccountOwner } from './owner'

afterEach(() => {
  vi.unstubAllEnvs()
})

it('does not load an Auth0 tenant when the prerelease flag is set', () => {
  expect(
    readAccountConfig({
      DRA_PRERELEASE: '1',
      DRA_AUTH_MODE: 'required',
      DRA_AUTH_ISSUER: 'https://tenant.auth0.com/',
      DRA_AUTH_CLIENT_ID: 'client'
    })
  ).toBeUndefined()
})

it('does not read a saved session or call Auth0 when login is forced off', async () => {
  vi.stubEnv('DRA_PRERELEASE', '1')
  const request = vi.fn()
  const browser = vi.fn()
  const store = { read: vi.fn(), write: vi.fn(), clear: vi.fn() }
  const owner = new AccountOwner({
    config: readAccountConfig({
      DRA_AUTH_ISSUER: 'https://tenant.auth0.com/',
      DRA_AUTH_CLIENT_ID: 'client'
    }),
    configurationError: true,
    fetch: request,
    openBrowser: browser,
    bindOwner: vi.fn(),
    sessionStore: store
  })
  const state = await owner.getState()
  expect(state).toMatchObject({
    configured: false,
    required: false,
    user: undefined,
    error: undefined
  })
  await expect(owner.begin({ method: 'email' })).rejects.toThrow(/unavailable/)
  expect(request).not.toHaveBeenCalled()
  expect(browser).not.toHaveBeenCalled()
  expect(store.read).not.toHaveBeenCalled()
  expect(store.write).not.toHaveBeenCalled()
  expect(() => owner.assertAccess()).not.toThrow()
})
