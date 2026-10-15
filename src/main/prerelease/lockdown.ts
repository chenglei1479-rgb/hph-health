import { net } from 'electron'

import {
  isBlockedPrereleaseUrl,
  isDraPrerelease,
  PRERELEASE_BLOCKED_REQUEST
} from '../../shared/prerelease'

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

const guardedFetch = (original: typeof fetch): typeof fetch =>
  (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (isBlockedPrereleaseUrl(requestUrl(input))) throw new Error(PRERELEASE_BLOCKED_REQUEST)
    return original(input, init)
  }) as typeof fetch

// Chromium net.fetch is a separate stack from global fetch. Update manifests use it.
const patchElectronNetFetch = (): void => {
  try {
    const current = net?.fetch
    if (!net || typeof current !== 'function') return
    net.fetch = guardedFetch(current.bind(net) as typeof fetch) as typeof net.fetch
  } catch {
    // A locked net.fetch cannot be wrapped. global fetch is still guarded.
  }
}

// Drops account configuration and refuses Auth0, usage statistics, and the upstream update host.
export const installMainPrereleaseLockdown = (): void => {
  if (!isDraPrerelease() || installed) return
  installed = true
  for (const key of AUTH_ENV_KEYS) delete process.env[key]
  process.env.DRA_TELEMETRY = '0'
  process.env.DRA_USAGE_STATISTICS = '0'
  patchElectronNetFetch()
  const original = globalThis.fetch
  if (typeof original !== 'function') return
  globalThis.fetch = guardedFetch(original)
}
