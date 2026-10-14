import { resolveProviderEffectiveModel } from '../../shared/provider-reasoning-effort'
import type { SettingsSnapshot } from '../../shared/settings'
import type { ReasoningEffortProfile } from '../../shared/reasoning-effort'
import type { ExplicitAgentBackendTarget } from '../settings/backend-target'
import type { ResolvedProvider } from '../settings/provider-env'
import {
  ProviderTextGenerationService,
  type ProviderTextGenerationTarget
} from '../settings/provider-text-generation'

export type VariableDefinitionSettings = {
  getSettingsView(): Promise<SettingsSnapshot>
  resolveExplicitDirectProvider(target: ExplicitAgentBackendTarget): Promise<{
    providerId: string
    provider: ResolvedProvider
    reasoningEffortProfile: ReasoningEffortProfile
  }>
}

/** The active settings provider, including a custom Azure base URL and the user's key. */
export const captureVariableDefinitionProviderTarget = async (
  settings: VariableDefinitionSettings,
  generate: Pick<
    ProviderTextGenerationService,
    'supportsTarget'
  > = new ProviderTextGenerationService()
): Promise<ProviderTextGenerationTarget | null> => {
  let snapshot: SettingsSnapshot
  try {
    snapshot = await settings.getSettingsView()
  } catch {
    return null
  }
  const providerId = snapshot.activeProviderId
  if (!providerId) return null
  const stored = snapshot.providers.find((value) => value.id === providerId)
  const modelId = resolveProviderEffectiveModel(stored, snapshot.activeModel)
  if (!modelId) return null
  try {
    const resolved = await settings.resolveExplicitDirectProvider({
      frameworkId: 'opencode',
      providerId,
      model: { kind: 'required', id: modelId },
      reasoningEffort: 'low'
    })
    const provider = {
      ...resolved.provider,
      model: resolved.provider.model ?? modelId
    }
    const target: ProviderTextGenerationTarget = {
      providerId: resolved.providerId,
      provider,
      model: provider.model,
      reasoningEffort: resolved.reasoningEffortProfile.supported
        ? resolved.reasoningEffortProfile.slots[0]
        : 'default'
    }
    return generate.supportsTarget(target) ? target : null
  } catch {
    return null
  }
}
