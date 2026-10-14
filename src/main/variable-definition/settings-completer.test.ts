import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ net: {} }))

import { VARIABLE_DEFINITION_MISSING_KEY_MESSAGE } from '../../shared/variable-definition'
import { installMachineApproval } from '../phi/gate'
import { ProviderTextGenerationService } from '../settings/provider-text-generation'
import { defaultVariableDefinitionCompleter } from './model-client'
import { captureVariableDefinitionProviderTarget } from './provider-target'
import { createSettingsVariableDefinitionCompleter } from './settings-completer'

const target = {
  providerId: 'azure',
  model: 'gpt-4o',
  provider: {
    type: 'custom' as const,
    baseUrl: 'https://hospital.openai.azure.com',
    model: 'gpt-4o',
    apiEndpoints: ['openai' as const],
    key: 'user-azure-key'
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
  installMachineApproval(null)
})

describe('settings variable definition completer', () => {
  it('calls the saved provider and keeps a dev env override optional', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        choices: [{ finish_reason: 'stop', message: { content: '[{"name":"年齢"}]' } }]
      })
    )
    const complete = createSettingsVariableDefinitionCompleter({
      resolveTarget: async () => target,
      generate: new ProviderTextGenerationService(fetchImpl as typeof fetch)
    })
    await expect(
      complete('研究計画。対象は100例で、変数定義だけを返してください。')
    ).resolves.toContain('年齢')
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://hospital.openai.azure.com/v1/chat/completions')
    expect(String(init.headers && (init.headers as Record<string, string>).authorization)).toBe(
      'Bearer user-azure-key'
    )
    expect(JSON.parse(String(init.body)).messages[1].content).toContain('100例')

    vi.stubEnv('DRA_VARIABLE_DEFINITION_BASE_URL', 'http://127.0.0.1:9/v1')
    vi.stubEnv('DRA_VARIABLE_DEFINITION_MODEL', 'dev-model')
    const devFetch = vi.fn(async () =>
      Response.json({ choices: [{ message: { content: '[{"name":"dev"}]' } }] })
    )
    const originalFetch = globalThis.fetch
    globalThis.fetch = devFetch as typeof fetch
    try {
      const overridden = defaultVariableDefinitionCompleter(async () => {
        throw new Error('settings should not be read')
      })
      await expect(overridden('dev plan 100')).resolves.toContain('dev')
    } finally {
      globalThis.fetch = originalFetch
    }
    expect(devFetch).toHaveBeenCalledOnce()
  })

  it('points at the API key settings when no key is configured', async () => {
    const complete = defaultVariableDefinitionCompleter(async () => null)
    await expect(complete('研究計画')).rejects.toThrow(VARIABLE_DEFINITION_MISSING_KEY_MESSAGE)
    await expect(complete('研究計画')).rejects.toThrow(/API キー欄/)
    await expect(complete('研究計画')).rejects.not.toThrow(/DRA_VARIABLE_DEFINITION/)
  })

  it('returns no target when the saved provider has no key', async () => {
    const captured = await captureVariableDefinitionProviderTarget({
      getSettingsView: async () =>
        ({
          activeProviderId: 'azure',
          activeModel: 'gpt-4o',
          providers: [
            {
              id: 'azure',
              type: 'custom',
              model: 'gpt-4o',
              baseUrl: 'https://hospital.openai.azure.com'
            }
          ]
        }) as never,
      resolveExplicitDirectProvider: async () => ({
        providerId: 'azure',
        provider: {
          type: 'custom',
          baseUrl: 'https://hospital.openai.azure.com',
          model: 'gpt-4o',
          apiEndpoints: ['openai']
        },
        reasoningEffortProfile: { supported: false }
      })
    })
    expect(captured).toBeNull()
  })

  it('uses the saved key and custom base URL', async () => {
    const captured = await captureVariableDefinitionProviderTarget({
      getSettingsView: async () =>
        ({
          activeProviderId: 'azure',
          activeModel: 'gpt-4o',
          providers: [{ id: 'azure', type: 'custom', model: 'gpt-4o' }]
        }) as never,
      resolveExplicitDirectProvider: async () => ({
        providerId: 'azure',
        provider: target.provider,
        reasoningEffortProfile: { supported: false }
      })
    })
    expect(captured?.model).toBe('gpt-4o')
    expect(captured?.provider.baseUrl).toBe('https://hospital.openai.azure.com')
    expect(captured?.provider.key).toBe('user-azure-key')
  })

  it('lets a PHI gate block leave the provider request unsent', async () => {
    const fetchImpl = vi.fn(async () => Response.json({}))
    const complete = createSettingsVariableDefinitionCompleter({
      resolveTarget: async () => target,
      generate: new ProviderTextGenerationService(fetchImpl as typeof fetch)
    })
    await expect(complete('担当は山田太郎さんです。')).rejects.toThrow(/not sent/)
    await expect(complete('担当は山田太郎さんです。')).rejects.toThrow(
      /^This machine is not approved/
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
