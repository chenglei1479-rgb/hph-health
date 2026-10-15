import { usageStatisticsAllowed } from './prerelease'

// Opt-in usage statistics. The payload is an allowlist: event names and counts, app version,
// a coarse operating system, and a random install id. Prompts, paths, file names, and model output
// cannot be represented by this schema. Prerelease builds force this off.

export const USAGE_STATISTICS_ENDPOINT = 'https://stats.REPLACE_ME/dra/usage'

export const USAGE_FEATURES = [
  'export',
  'citation_check',
  'case_report',
  'settings',
  'update'
] as const
export const USAGE_ERROR_CODES = ['network', 'storage', 'unknown'] as const
export const USAGE_EVENT_NAMES = ['feature_used', 'error'] as const
export const USAGE_OPERATING_SYSTEMS = ['macos', 'windows', 'linux', 'other'] as const
export const USAGE_PAYLOAD_ALLOWLIST = [
  'installId',
  'appVersion',
  'os',
  'events',
  'name',
  'count',
  'feature',
  'errorCode'
] as const

export type UsageFeature = (typeof USAGE_FEATURES)[number]
export type UsageErrorCode = (typeof USAGE_ERROR_CODES)[number]
export type UsageOperatingSystem = (typeof USAGE_OPERATING_SYSTEMS)[number]

export type UsageStatisticsEvent =
  | { name: 'feature_used'; count: number; feature: UsageFeature }
  | { name: 'error'; count: number; errorCode: UsageErrorCode }

export type UsageStatisticsPayload = {
  installId: string
  appVersion: string
  os: UsageOperatingSystem
  events: UsageStatisticsEvent[]
}

const ALLOWED_KEYS = new Set<string>(USAGE_PAYLOAD_ALLOWLIST)
const INSTALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const APP_VERSION = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/

export const isUsageStatisticsPlaceholder = (endpoint: string): boolean =>
  !endpoint.startsWith('https://') ||
  endpoint.includes('REPLACE_ME') ||
  endpoint.includes('.invalid')

export const coarseOperatingSystem = (platform: string): UsageOperatingSystem => {
  const value = platform.toLowerCase()
  if (value.includes('mac')) return 'macos'
  if (value.includes('win')) return 'windows'
  if (value.includes('linux')) return 'linux'
  return 'other'
}

const walkKeys = (value: unknown, keys: Set<string>): void => {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const item of value) walkKeys(item, keys)
    return
  }
  for (const [key, child] of Object.entries(value)) {
    keys.add(key)
    walkKeys(child, keys)
  }
}

export const usagePayloadKeys = (payload: UsageStatisticsPayload): string[] => {
  const keys = new Set<string>()
  walkKeys(payload, keys)
  return [...keys]
}

export const payloadRespectsAllowlist = (payload: UsageStatisticsPayload): boolean =>
  usagePayloadKeys(payload).every((key) => ALLOWED_KEYS.has(key))

const asFeature = (value: unknown): UsageFeature | undefined =>
  typeof value === 'string' && (USAGE_FEATURES as readonly string[]).includes(value)
    ? (value as UsageFeature)
    : undefined

const asErrorCode = (value: unknown): UsageErrorCode | undefined =>
  typeof value === 'string' && (USAGE_ERROR_CODES as readonly string[]).includes(value)
    ? (value as UsageErrorCode)
    : undefined

const sanitizeEvent = (value: unknown): UsageStatisticsEvent | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const event = value as { name?: unknown; count?: unknown; feature?: unknown; errorCode?: unknown }
  if (typeof event.count !== 'number' || !Number.isInteger(event.count)) return undefined
  if (event.count < 1 || event.count > 10_000) return undefined
  if (event.name === 'feature_used') {
    const feature = asFeature(event.feature)
    return feature ? { name: 'feature_used', count: event.count, feature } : undefined
  }
  if (event.name === 'error') {
    const errorCode = asErrorCode(event.errorCode)
    return errorCode ? { name: 'error', count: event.count, errorCode } : undefined
  }
  return undefined
}

export const buildUsageStatisticsPayload = (input: {
  installId: string
  appVersion: string
  os: string
  events?: readonly unknown[]
}): UsageStatisticsPayload => {
  if (!INSTALL_ID.test(input.installId)) throw new Error('Invalid install id.')
  if (!APP_VERSION.test(input.appVersion)) throw new Error('Invalid app version.')
  const payload: UsageStatisticsPayload = {
    installId: input.installId.toLowerCase(),
    appVersion: input.appVersion,
    os: coarseOperatingSystem(input.os),
    events: (input.events ?? []).flatMap((event) => {
      const sanitized = sanitizeEvent(event)
      return sanitized ? [sanitized] : []
    })
  }
  if (!payloadRespectsAllowlist(payload)) throw new Error('Usage payload left the allowlist.')
  return payload
}

export const sendUsageStatistics = async (
  payload: UsageStatisticsPayload,
  options: { optIn: boolean; endpoint?: string; fetchImpl?: typeof fetch }
): Promise<'sent' | 'opt-out' | 'placeholder'> => {
  if (!options.optIn || !usageStatisticsAllowed()) return 'opt-out'
  const endpoint = options.endpoint ?? USAGE_STATISTICS_ENDPOINT
  if (isUsageStatisticsPlaceholder(endpoint)) return 'placeholder'
  if (!payloadRespectsAllowlist(payload)) throw new Error('Usage payload left the allowlist.')
  const response = await (options.fetchImpl ?? fetch)(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!response.ok) throw new Error('Usage statistics request failed.')
  return 'sent'
}
