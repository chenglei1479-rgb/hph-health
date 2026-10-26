declare const __DRA_PRERELEASE__: boolean | undefined

// Brief 28 copy A, shown beside the provider key and before the first model call.
// English source text is the renderer catalog key; every locale carries the approved meaning.
export const PRERELEASE_DATA_DESTINATION_NOTICE =
  'Pre-send checks and restrictions help prevent direct identifiers such as names and patient IDs from being sent. This is not an absolute guarantee.'

// Beta/seed scope and configured provider destination remain visible beside the checks notice.
export const PRERELEASE_DATA_USE_NOTICE =
  'For beta/seed use, please use fictional data only. Formal hospital operations and real data are out of scope. Requests are sent to the AI service you configure (for OpenAI, the United States). Usage fees are billed by your own provider.'

// Settings → About. Same scheme as the data-destination notice: the English source text is the
// renderer catalog key, so a beta build states its update policy in the active language.
export const PRERELEASE_UPDATE_NOTICE =
  'Automatic updates are disabled in the beta build. New versions are announced by the distributor.'

export const PRERELEASE_BLOCKED_REQUEST =
  'Prerelease builds do not contact Auth0, usage statistics, or the upstream update host.'

const runtimeEnv = (): NodeJS.ProcessEnv => (typeof process === 'undefined' ? {} : process.env)

// Vite replaces the boolean while building main and renderer. A packaged beta therefore stays
// offline even when the user launches it without DRA_PRERELEASE in the environment. Tests and the
// prerelease workflow can also set that variable directly.
const bakedPrerelease = (): boolean =>
  typeof __DRA_PRERELEASE__ === 'boolean' ? __DRA_PRERELEASE__ : false

export const isDraPrerelease = (env: NodeJS.ProcessEnv = runtimeEnv()): boolean =>
  bakedPrerelease() || env.DRA_PRERELEASE === '1'

// Beta builds do not phone home. Crash dumps stay local (uploadToServer is already false).
export const telemetryAllowed = (env?: NodeJS.ProcessEnv): boolean => !isDraPrerelease(env)

export const usageStatisticsAllowed = (env?: NodeJS.ProcessEnv): boolean => !isDraPrerelease(env)

// Auth0, the anonymous usage endpoint, and the upstream update host are refused.
// Provider calls (OpenAI, Azure OpenAI, or another endpoint the user typed) stay allowed and
// still pass through fetchProviderRequest, which applies the PHI gate when that module is present.
export const isBlockedPrereleaseUrl = (value: string): boolean => {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  const host = url.hostname.toLowerCase()
  if (host === 'statics.aipoch.com') return true
  if (host === 'auth0.com' || host.endsWith('.auth0.com')) return true
  return url.pathname === '/dra/usage' || url.pathname.endsWith('/dra/usage')
}
