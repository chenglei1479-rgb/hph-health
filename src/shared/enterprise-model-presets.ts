// Configuration templates use the existing encrypted custom-provider credential path.
// They do not certify an institution's deployment or promise geographic confinement.
export const ENTERPRISE_MODEL_PRESETS = [
  {
    id: 'azure-openai', label: 'Azure OpenAI',
    baseUrl: 'https://YOUR-RESOURCE.openai.azure.com/openai/v1',
    apiEndpoint: 'responses' as const,
    help: 'Use your Azure resource endpoint, deployment name and credential. Confirm the deployment type and processing geography with your institution.'
  },
  {
    id: 'bedrock-tokyo', label: 'AWS Bedrock (Tokyo)',
    baseUrl: 'https://bedrock-runtime.ap-northeast-1.amazonaws.com/openai/v1',
    apiEndpoint: 'openai' as const,
    help: 'Use a Bedrock API key and a model enabled for this API in Tokyo. Cross-region inference profiles require a separate residency review.'
  },
  {
    id: 'vertex-tokyo', label: 'Vertex AI (Tokyo)',
    baseUrl: 'https://asia-northeast1-aiplatform.googleapis.com/v1/projects/YOUR-PROJECT/locations/asia-northeast1/endpoints/openapi',
    apiEndpoint: 'openai' as const,
    help: 'Use a Google Cloud access token and a model available in this region. Tokens expire; automatic ADC refresh is not implemented. Do not paste a service-account private key.'
  },
  {
    id: 'vertex-osaka', label: 'Vertex AI (Osaka)',
    baseUrl: 'https://asia-northeast2-aiplatform.googleapis.com/v1/projects/YOUR-PROJECT/locations/asia-northeast2/endpoints/openapi',
    apiEndpoint: 'openai' as const,
    help: 'Use a Google Cloud access token and a model available in this region. Tokens expire; automatic ADC refresh is not implemented. Do not paste a service-account private key.'
  }
] as const

export type EnterpriseModelPreset = (typeof ENTERPRISE_MODEL_PRESETS)[number]

export const enterpriseModelPresetPatch = (preset: EnterpriseModelPreset) => ({
  type: 'custom' as const,
  name: preset.label,
  baseUrl: preset.baseUrl,
  model: '', // Deployment/model ids are customer-specific; never guess or silently fall back.
  key: '', // Never carry a previous provider's credential across the preset switch.
  apiEndpoint: preset.apiEndpoint,
  vendorId: undefined,
  region: undefined,
  supportsImageInput: false,
  reasoningEffortPreset: 'unsupported' as const,
  contextWindow: '', maxInputTokens: '', maxOutputTokens: ''
})

// Only Google's documented OpenAI compatibility endpoint bypasses the custom /v1 rule.
export function isVertexOpenAiBase(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash &&
      /^(?:[a-z]+(?:-[a-z0-9]+)*-)?aiplatform\.googleapis\.com$/.test(u.hostname) &&
      /^\/v1(?:beta1)?\/projects\/[^/]+\/locations\/[^/]+\/endpoints\/openapi\/?$/.test(u.pathname)
  } catch { return false }
}
