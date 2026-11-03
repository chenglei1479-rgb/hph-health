import { resolveProviderEffectiveModel } from '../../shared/provider-reasoning-effort'
import type { ModelRequirementCheck } from '../../shared/model-requirement'
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

/**
 * The pre-flight answer the panel needs before it shows its form (#134). It reads configuration
 * only — no request is sent and no tokens are spent — and it separates "nothing configured yet"
 * from "configured but unusable", because the doctor's next step differs.
 */
export const probeVariableDefinitionProvider = async (
  settings: VariableDefinitionSettings,
  generate: Pick<
    ProviderTextGenerationService,
    'supportsTarget'
  > = new ProviderTextGenerationService()
): Promise<{ check: ModelRequirementCheck; target: ProviderTextGenerationTarget | null }> => {
  const notReady = (
    check: ModelRequirementCheck
  ): { check: ModelRequirementCheck; target: null } => ({
    check,
    target: null
  })
  let snapshot: SettingsSnapshot
  try {
    snapshot = await settings.getSettingsView()
  } catch {
    return notReady({ status: 'unavailable', code: 'model-requirement-settings-unreadable' })
  }
  const providerId = snapshot.activeProviderId
  if (!providerId) return notReady({ status: 'not-configured', missing: 'provider' })
  const stored = snapshot.providers.find((value) => value.id === providerId)
  const modelId = resolveProviderEffectiveModel(stored, snapshot.activeModel)
  if (!modelId) return notReady({ status: 'not-configured', missing: 'model' })
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
    if (!generate.supportsTarget(target)) {
      return notReady({ status: 'unavailable', code: 'model-requirement-provider-rejected' })
    }
    const providerLabel = stored?.name?.trim() || stored?.type || resolved.providerId
    return {
      check: {
        status: 'ready',
        providerId: resolved.providerId,
        providerLabel,
        modelId: provider.model
      },
      target
    }
  } catch {
    return notReady({ status: 'unavailable', code: 'model-requirement-provider-rejected' })
  }
}

/** The active settings provider, including a custom Azure base URL and the user's key. */
export const captureVariableDefinitionProviderTarget = async (
  settings: VariableDefinitionSettings,
  generate: Pick<
    ProviderTextGenerationService,
    'supportsTarget'
  > = new ProviderTextGenerationService()
): Promise<ProviderTextGenerationTarget | null> =>
  (await probeVariableDefinitionProvider(settings, generate)).target
