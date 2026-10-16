import { createRequire } from 'node:module'
import * as electronModule from 'electron'

import {
  isBlockedPrereleaseUrl,
  isDraPrerelease,
  PRERELEASE_BLOCKED_REQUEST
} from '../../shared/prerelease'

const require = createRequire(import.meta.url)

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

// Chromium net.fetch is a separate stack from global fetch. Update manifests use it.
// A namespace import stays loadable in the Node backend (electron has no named net export
// there) and still sees the Vitest mock. createRequire covers the Electron main process
// when that binding is a different object.
const patchElectronNetFetch = (): void => {
  const namespace = electronModule as ElectronNet & { default?: ElectronNet }
  patchNet(namespace.net)
  try {
    // Vitest's electron mock has no default export and throws if it is read.
    patchNet(namespace.default?.net)
  } catch {
    // The namespace binding is enough when default is absent.
  }
  try {
    const loaded = require('electron') as ElectronNet | string | undefined
    if (loaded && typeof loaded === 'object') patchNet(loaded.net)
  } catch {
    // The Node backend does not provide Electron's net module.
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
