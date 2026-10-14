import { isBlockedPrereleaseUrl, isDraPrerelease } from '../../shared/prerelease'

const AUTH_ENV_KEYS = [
  'DRA_AUTH_MODE',
  'DRA_AUTH_ISSUER',
  'DRA_AUTH_CLIENT_ID',
  'DRA_AUTH_AUDIENCE',
  'DRA_AUTH_ORGANIZATION',
  'DRA_AUTH_CALLBACK_PORT',
  'DRA_AUTH_GOOGLE_CONNECTION',
  'DRA_AUTH_MICROSOFT_CONNECTION',
  'DRA_AUTH_APPLE_CONNECTION',
  'DRA_AUTH_INSTITUTION_CONNECTION'
] as const

let installed = false

const requestUrl = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

// Drops account configuration and refuses Auth0 or usage-statistics requests for this process.
export const installMainPrereleaseLockdown = (): void => {
  if (!isDraPrerelease() || installed) return
  installed = true
  for (const key of AUTH_ENV_KEYS) delete process.env[key]
  process.env.DRA_TELEMETRY = '0'
  process.env.DRA_USAGE_STATISTICS = '0'
  const original = globalThis.fetch
  if (typeof original !== 'function') return
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (isBlockedPrereleaseUrl(requestUrl(input))) {
      throw new Error('Prerelease builds do not contact Auth0 or usage statistics.')
    }
    return original(input, init)
  }) as typeof fetch
}
