import { afterEach, describe, expect, it, vi } from 'vitest'

import { isBlockedPrereleaseUrl } from '../../shared/prerelease'

// Documents the pre-existing beta gap (task 04 §2.2): the lockdown wraps globalThis.fetch and
// Electron net.fetch, but the backend runtime network (netFetchStandard) and the manual-redirect
// helper used by the marketplaces read the runtime network directly. This test records the current
// behaviour; it deliberately does NOT block the path. Blocking it before R1/R2 have a replacement
// source would break the Notebook for beta doctors.
describe('beta lockdown coverage gap', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('records that netFetchStandard and netFetchWithManualRedirect reach statics.aipoch.com', async () => {
    vi.resetModules()
    vi.stubEnv('DRA_PRERELEASE', '1')
    const calls: string[] = []
    const fakeFetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input))
      return new Response('ok')
    }) as typeof fetch
    const { configureRuntimeNetwork } = await import('../runtime-network')
    configureRuntimeNetwork({
      fetch: fakeFetch,
      fetchWithManualRedirect: fakeFetch,
      resolveProxy: async () => '',
      setProxy: async () => undefined
    })
    const { installMainPrereleaseLockdown } = await import('./lockdown')
    const originalGlobalFetch = globalThis.fetch
    try {
      installMainPrereleaseLockdown()
      const { netFetchStandard, netFetchWithManualRedirect } = await import('../network-fetch')
      await netFetchStandard('https://statics.aipoch.com/open-science/notebook-runtime/probe')
      await netFetchWithManualRedirect(
        'https://statics.aipoch.com/open-science/skill-marketplace/v1/marketplace.json'
      )
      expect(calls).toEqual([
        'https://statics.aipoch.com/open-science/notebook-runtime/probe',
        'https://statics.aipoch.com/open-science/skill-marketplace/v1/marketplace.json'
      ])
      expect(isBlockedPrereleaseUrl(calls[0]!)).toBe(true)
      // The guarded global path is still blocked, which is why the gap is easy to miss.
      await expect(fetch('https://statics.aipoch.com/open-science/x')).rejects.toThrow(
        'Prerelease builds do not contact'
      )
    } finally {
      globalThis.fetch = originalGlobalFetch
    }
  })
})
