import { afterEach, describe, expect, it, vi } from 'vitest'

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }))
vi.mock('../logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../logger')>()
  return {
    ...actual,
    createLogger: () => ({ warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() })
  }
})

import {
  enforceOutboundUrl,
  registerUserModelEndpointUrl,
  resetUserModelEndpointHosts
} from './external-endpoint-guard'

describe('external endpoint guard', () => {
  afterEach(() => {
    warn.mockReset()
    resetUserModelEndpointHosts()
  })

  it('blocks and logs an unlisted host without sending the path', () => {
    expect(() => enforceOutboundUrl('https://unknown.invalid.example/secret-path')).toThrow(
      'Blocked outbound request to unknown.invalid.example'
    )
    expect(warn).toHaveBeenCalledWith('blocked outbound request', {
      host: 'unknown.invalid.example'
    })
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-path')
  })

  it('allows a user-configured model endpoint after it is registered', () => {
    registerUserModelEndpointUrl('https://api.openai.com/v1')
    expect(() => enforceOutboundUrl('https://api.openai.com/v1/chat/completions')).not.toThrow()
    expect(warn).not.toHaveBeenCalled()
  })
})
