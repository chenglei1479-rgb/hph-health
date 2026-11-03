// #134: a panel that needs a model can only be honest about its requirements if it asks before the
// form is shown. The check is a configuration read, never a paid request: it answers "can this
// feature run here" and "where do I fix it", and the panel renders the form only for `ready`.
export type ModelRequirementFailureCode =
  // Settings could not be read at all — retrying is the next step, not configuring.
  | 'model-requirement-settings-unreadable'
  // A provider is configured but cannot produce text (deleted, unsupported, or rejected while
  // resolving its key): the next step is checking that provider, not adding a new one.
  | 'model-requirement-provider-rejected'

export type ModelRequirementCheck =
  | {
      status: 'ready'
      providerId: string
      providerLabel: string
      modelId: string
    }
  // Nothing usable is configured yet. This is not a failure: the feature is simply not available
  // until a provider is added.
  | { status: 'not-configured'; missing: 'provider' | 'model' }
  | { status: 'unavailable'; code: ModelRequirementFailureCode }

export const modelRequirementIsReady = (
  check: ModelRequirementCheck
): check is Extract<ModelRequirementCheck, { status: 'ready' }> => check.status === 'ready'
