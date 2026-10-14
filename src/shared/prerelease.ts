declare const __DRA_PRERELEASE__: boolean | undefined

// Fixed wording for the internal beta. It is not localized: every locale shows this sentence.
export const PRERELEASE_BANNER_TEXT = '内部テスト版：架空データのみ使用してください'

// Shown beside the provider key and before the first model call. Fixed Japanese on every locale.
export const PRERELEASE_DATA_DESTINATION_NOTICE =
  '架空データのみ。リクエストは設定した AI サービス（OpenAI の場合は米国）へ送信されます。利用料金はご自身の契約先から請求されます。'

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

// Auth0 and the anonymous usage endpoint are the only hosts a prerelease build must refuse.
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
  if (host === 'auth0.com' || host.endsWith('.auth0.com')) return true
  return url.pathname === '/dra/usage' || url.pathname.endsWith('/dra/usage')
}
