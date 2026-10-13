import type {
  ProviderView,
  SessionDetailsModelConfiguration,
  SubagentModelConfiguration,
  VisionModelConfiguration
} from './settings'

export type DataRoute = {
  role: 'main' | 'details' | 'subagent' | 'reviewer' | 'vision'
  status: 'configured' | 'unknown' | 'disabled'
  recipient?: string
  model?: string
  endpoint?: string
  loopback?: boolean
}
export const safeEndpoint = (
  baseUrl: string | undefined
): { endpoint: string; loopback: boolean } | undefined => {
  if (!baseUrl) return undefined
  try {
    const url = new URL(baseUrl)
    if (!['https:', 'http:'].includes(url.protocol)) return undefined
    // Display only the configured origin. Never expose userinfo, request paths, query keys or fragments.
    const hostname = url.hostname.toLowerCase()
    return {
      endpoint: `${url.protocol}//${url.host}`,
      loopback:
        hostname === 'localhost' || hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(hostname)
    }
  } catch {
    return undefined
  }
}

export const configuredDataRoutes = (input: {
  providers: readonly ProviderView[]
  providerId?: string
  model?: string
  details: SessionDetailsModelConfiguration
  subagent: SubagentModelConfiguration
  reviewer: SubagentModelConfiguration
  vision?: VisionModelConfiguration
}): DataRoute[] => {
  const resolve = (role: DataRoute['role'], providerId?: string, model?: string): DataRoute => {
    const provider = input.providers.find((item) => item.id === providerId)
    if (!provider) return { role, status: 'unknown', ...(model ? { model } : {}) }
    return {
      role,
      status: 'configured',
      recipient: provider.name,
      ...(model ? { model } : {}),
      ...safeEndpoint(provider.baseUrl)
    }
  }
  const scenario = (
    role: DataRoute['role'],
    config: SubagentModelConfiguration | SessionDetailsModelConfiguration
  ): DataRoute => {
    if (config.mode === 'disabled') return { role, status: 'disabled' }
    return config.mode === 'fixed'
      ? resolve(role, config.providerId, config.model)
      : resolve(role, input.providerId, input.model)
  }
  return [
    resolve('main', input.providerId, input.model),
    scenario('details', input.details),
    scenario('subagent', input.subagent),
    scenario('reviewer', input.reviewer),
    input.vision
      ? resolve('vision', input.vision.providerId, input.vision.model)
      : { role: 'vision', status: 'disabled' }
  ]
}
