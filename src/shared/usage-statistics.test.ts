import { describe, expect, it, vi } from 'vitest'

import {
  USAGE_PAYLOAD_ALLOWLIST,
  USAGE_STATISTICS_ENDPOINT,
  buildUsageStatisticsPayload,
  isUsageStatisticsPlaceholder,
  payloadRespectsAllowlist,
  sendUsageStatistics,
  usagePayloadKeys
} from './usage-statistics'

const installId = '6f1d7c2e-8b4a-4c3d-9e1f-2a6b7c8d9e0f'

describe('usage statistics payload', () => {
  it('keeps only allowlisted event names, counts, version, OS, and the install id', () => {
    const payload = buildUsageStatisticsPayload({
      installId,
      appVersion: '0.1.33-unified.1',
      os: 'Linux x86_64',
      events: [
        { name: 'feature_used', count: 2, feature: 'export', prompt: 'summarize this patient' },
        {
          name: 'error',
          count: 1,
          errorCode: 'network',
          path: '/Users/researcher/notes/case.pdf',
          fileName: 'case.pdf',
          output: 'model text'
        },
        { name: 'feature_used', count: 1, feature: 'free text prompt' },
        { name: 'prompt_text', count: 1, feature: 'export' }
      ]
    })

    expect(payload).toEqual({
      installId,
      appVersion: '0.1.33-unified.1',
      os: 'linux',
      events: [
        { name: 'feature_used', count: 2, feature: 'export' },
        { name: 'error', count: 1, errorCode: 'network' }
      ]
    })
    const allowed = new Set<string>(USAGE_PAYLOAD_ALLOWLIST)
    expect(usagePayloadKeys(payload).every((key) => allowed.has(key))).toBe(true)
    expect(payloadRespectsAllowlist(payload)).toBe(true)
    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('summarize')
    expect(serialized).not.toContain('case.pdf')
    expect(serialized).not.toContain('/Users')
    expect(serialized).not.toContain('model text')
    expect(serialized).not.toContain('prompt')
  })

  it('does not send when opted out or while the endpoint is a placeholder', async () => {
    const fetchImpl = vi.fn()
    const payload = buildUsageStatisticsPayload({
      installId,
      appVersion: '0.1.33-unified.1',
      os: 'darwin',
      events: [{ name: 'feature_used', count: 1, feature: 'settings' }]
    })
    expect(isUsageStatisticsPlaceholder(USAGE_STATISTICS_ENDPOINT)).toBe(true)
    await expect(sendUsageStatistics(payload, { optIn: true, fetchImpl })).resolves.toBe(
      'placeholder'
    )
    await expect(
      sendUsageStatistics(payload, {
        optIn: false,
        endpoint: 'https://stats.example.com/dra/usage',
        fetchImpl
      })
    ).resolves.toBe('opt-out')
    expect(fetchImpl).not.toHaveBeenCalled()

    fetchImpl.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(
      sendUsageStatistics(payload, {
        optIn: true,
        endpoint: 'https://stats.example.com/dra/usage',
        fetchImpl
      })
    ).resolves.toBe('sent')
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual(payload)
  })

  it('stays off on a prerelease build even when opt-in is on', async () => {
    vi.stubEnv('DRA_PRERELEASE', '1')
    const fetchImpl = vi.fn()
    const payload = buildUsageStatisticsPayload({
      installId,
      appVersion: '0.1.33-unified.1',
      os: 'darwin',
      events: [{ name: 'feature_used', count: 1, feature: 'settings' }]
    })
    await expect(
      sendUsageStatistics(payload, {
        optIn: true,
        endpoint: 'https://stats.example.com/dra/usage',
        fetchImpl
      })
    ).resolves.toBe('opt-out')
    expect(fetchImpl).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
})
