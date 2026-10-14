import { afterEach, expect, it, vi } from 'vitest'

import { installMainPrereleaseLockdown } from './lockdown'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.unstubAllEnvs()
  delete process.env.DRA_TELEMETRY
  delete process.env.DRA_USAGE_STATISTICS
})

it('drops account configuration and refuses Auth0 and usage statistics', async () => {
  vi.stubEnv('DRA_PRERELEASE', '1')
  vi.stubEnv('DRA_AUTH_ISSUER', 'https://tenant.auth0.com/')
  vi.stubEnv('DRA_AUTH_CLIENT_ID', 'client')
  const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))
  globalThis.fetch = fetchImpl as typeof fetch

  installMainPrereleaseLockdown()

  await expect(fetch('https://tenant.auth0.com/authorize')).rejects.toThrow(/Auth0/)
  await expect(fetch('https://stats.example.com/dra/usage', { method: 'POST' })).rejects.toThrow(
    /usage statistics/
  )
  await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST' })
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  expect(process.env.DRA_AUTH_ISSUER).toBeUndefined()
  expect(process.env.DRA_AUTH_CLIENT_ID).toBeUndefined()
  expect(process.env.DRA_TELEMETRY).toBe('0')
  expect(process.env.DRA_USAGE_STATISTICS).toBe('0')
})
