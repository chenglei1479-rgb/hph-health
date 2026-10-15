import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  isBlockedPrereleaseUrl,
  isDraPrerelease,
  telemetryAllowed,
  usageStatisticsAllowed
} from './prerelease'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('prerelease flag', () => {
  it('is off unless DRA_PRERELEASE is exactly 1', () => {
    expect(isDraPrerelease({})).toBe(false)
    expect(isDraPrerelease({ DRA_PRERELEASE: 'true' })).toBe(false)
    expect(isDraPrerelease({ DRA_PRERELEASE: '1' })).toBe(true)
  })

  it('forces telemetry and usage statistics off', () => {
    expect(telemetryAllowed({})).toBe(true)
    expect(usageStatisticsAllowed({})).toBe(true)
    expect(telemetryAllowed({ DRA_PRERELEASE: '1' })).toBe(false)
    expect(usageStatisticsAllowed({ DRA_PRERELEASE: '1' })).toBe(false)
  })

  it('blocks Auth0, usage statistics, and the upstream update host without blocking a user model endpoint', () => {
    expect(isBlockedPrereleaseUrl('https://tenant.auth0.com/oauth/token')).toBe(true)
    expect(isBlockedPrereleaseUrl('https://dev-example.us.auth0.com/.well-known/jwks.json')).toBe(
      true
    )
    expect(isBlockedPrereleaseUrl('https://stats.example.com/dra/usage')).toBe(true)
    expect(
      isBlockedPrereleaseUrl(
        'https://statics.aipoch.com/medical-research-agent/app/stable/version.json'
      )
    ).toBe(true)
    expect(
      isBlockedPrereleaseUrl(
        'https://statics.aipoch.com/open-science/runtime-bundle/1/manifest.json'
      )
    ).toBe(true)
    expect(isBlockedPrereleaseUrl('https://not-statics.aipoch.com.example/version.json')).toBe(
      false
    )
    expect(isBlockedPrereleaseUrl('https://api.openai.com/v1/chat/completions')).toBe(false)
    expect(
      isBlockedPrereleaseUrl(
        'https://example.openai.azure.com/openai/deployments/dra/chat/completions'
      )
    ).toBe(false)
    expect(isBlockedPrereleaseUrl('not a url')).toBe(false)
  })

  it('reads the process environment when no env object is passed', () => {
    vi.stubEnv('DRA_PRERELEASE', '1')
    expect(isDraPrerelease()).toBe(true)
  })
})
