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

type ElectronNet = { fetch?: typeof fetch }

const patchNet = (net: ElectronNet | undefined): void => {
  try {
    const current = net?.fetch
    if (!net || typeof current !== 'function') return
    if ((current as { draGuarded?: boolean }).draGuarded) return
    const guarded = guardedFetch(current.bind(net) as typeof fetch) as typeof fetch & {
      draGuarded?: boolean
    }
    guarded.draGuarded = true
    net.fetch = guarded
  } catch {
    // A locked net.fetch cannot be wrapped. global fetch is still guarded.
  }
}

// Chromium net.fetch is a separate stack from global fetch. The Electron shell passes its
// net binding in. The Node backend does not import Electron.
export const installMainPrereleaseLockdown = (electronNet?: ElectronNet): void => {
  if (!isDraPrerelease() || installed) return
  installed = true
  for (const key of AUTH_ENV_KEYS) delete process.env[key]
  process.env.DRA_TELEMETRY = '0'
  process.env.DRA_USAGE_STATISTICS = '0'
  patchNet(electronNet)
  const original = globalThis.fetch
  if (typeof original !== 'function') return
  globalThis.fetch = guardedFetch(original)
}
