import { describe, expect, it } from 'vitest'

import { probeVariableDefinitionProvider, type VariableDefinitionSettings } from './provider-target'

const settingsWith = (
  snapshot: Record<string, unknown>,
  resolve: VariableDefinitionSettings['resolveExplicitDirectProvider'] = async () => ({
    providerId: 'azure',
    provider: {
      type: 'custom',
      baseUrl: 'https://hospital.openai.azure.com',
      model: 'gpt-4o',
      apiEndpoints: ['openai']
    },
    reasoningEffortProfile: { supported: false }
  })
): VariableDefinitionSettings => ({
  getSettingsView: async () => snapshot as never,
  resolveExplicitDirectProvider: resolve
})

const supports = (value: boolean): { supportsTarget: () => boolean } => ({
  supportsTarget: () => value
})

describe('variable definition model requirement (#134)', () => {
  it('reports a missing provider instead of failing later', async () => {
    const result = await probeVariableDefinitionProvider(
      settingsWith({ activeProviderId: undefined, providers: [] }),
      supports(true)
    )

    expect(result.check).toEqual({ status: 'not-configured', missing: 'provider' })
    expect(result.target).toBeNull()
  })

  it('reports a provider without a model as its own case', async () => {
    const result = await probeVariableDefinitionProvider(
      settingsWith({ activeProviderId: 'azure', activeModel: '', providers: [{ id: 'azure' }] }),
      supports(true)
    )

    expect(result.check).toEqual({ status: 'not-configured', missing: 'model' })
  })

  it('reports an unreadable settings read as retryable, not as unconfigured', async () => {
    const result = await probeVariableDefinitionProvider(
      {
        getSettingsView: async () => {
          throw new Error('settings unavailable')
        },
        resolveExplicitDirectProvider: async () => {
          throw new Error('unreachable')
        }
      },
      supports(true)
    )

    expect(result.check).toEqual({
      status: 'unavailable',
      code: 'model-requirement-settings-unreadable'
    })
  })

  it('reports a configured provider that cannot produce text separately', async () => {
    const rejected = await probeVariableDefinitionProvider(
      settingsWith(
        { activeProviderId: 'azure', activeModel: 'gpt-4o', providers: [{ id: 'azure' }] },
        async () => {
          throw new Error('key rejected')
        }
      ),
      supports(true)
    )
    expect(rejected.check).toEqual({
      status: 'unavailable',
      code: 'model-requirement-provider-rejected'
    })

    const unsupported = await probeVariableDefinitionProvider(
      settingsWith({
        activeProviderId: 'azure',
        activeModel: 'gpt-4o',
        providers: [{ id: 'azure' }]
      }),
      supports(false)
    )
    expect(unsupported.check).toEqual({
      status: 'unavailable',
      code: 'model-requirement-provider-rejected'
    })
  })

  it('names the provider and model the panel will use', async () => {
    const result = await probeVariableDefinitionProvider(
      settingsWith({
        activeProviderId: 'azure',
        activeModel: 'gpt-4o',
        providers: [{ id: 'azure', type: 'custom', model: 'gpt-4o', name: 'Azure OpenAI' }]
      }),
      supports(true)
    )

    expect(result.check).toEqual({
      status: 'ready',
      providerId: 'azure',
      providerLabel: 'Azure OpenAI',
      modelId: 'gpt-4o'
    })
    expect(result.target?.provider.baseUrl).toBe('https://hospital.openai.azure.com')
  })
})
