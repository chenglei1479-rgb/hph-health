import { isBlockedPrereleaseUrl, isDraPrerelease } from '../../../shared/prerelease'

const USAGE_OPT_IN_STORAGE_KEY = 'dra-usage-statistics-opt-in'
const USAGE_INSTALL_ID_STORAGE_KEY = 'dra-usage-install-id'

let installed = false

const requestUrl = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

// Renderer-side twin of the main-process lockdown. Account UI is skipped separately.
export const installRendererPrereleaseLockdown = (): void => {
  if (!isDraPrerelease() || installed || typeof window === 'undefined') return
  installed = true
  try {
    window.localStorage.setItem(USAGE_OPT_IN_STORAGE_KEY, 'off')
    window.localStorage.removeItem(USAGE_INSTALL_ID_STORAGE_KEY)
  } catch {
    // Storage can be blocked; the fetch refusal below still stops a send.
  }
  const original = window.fetch.bind(window)
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (isBlockedPrereleaseUrl(requestUrl(input))) {
      throw new Error('Prerelease builds do not contact Auth0 or usage statistics.')
    }
    return original(input, init)
  }) as typeof window.fetch
}
