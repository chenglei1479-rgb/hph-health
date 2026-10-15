import { copyForLocale } from './copy-locale'
import type { Locale } from './locale'

declare const __DRA_PRERELEASE__: boolean | undefined

// Japanese wording for the ja locale. Other locales use prereleaseBannerText.
// The warning stays on every prerelease build; only the sentence follows the UI language.
export const PRERELEASE_BANNER_TEXT = '内部テスト版：架空データのみ使用してください'

const PRERELEASE_BANNER_TEXT_BY_LOCALE = {
  en: 'Internal test build: use fictional data only',
  'zh-Hans': '内部测试版：请仅使用虚构数据',
  'zh-Hant': '內部測試版：請僅使用虛構資料',
  ja: PRERELEASE_BANNER_TEXT,
  ko: '내부 테스트판: 가상 데이터만 사용하십시오',
  fr: 'Version de test interne : utilisez uniquement des données fictives',
  ru: 'Внутренняя тестовая версия: используйте только вымышленные данные',
  de: 'Interne Testversion: Bitte nur fiktive Daten verwenden',
  es: 'Versión de prueba interna: utilice solo datos ficticios'
} satisfies Record<Locale, string>

export const prereleaseBannerText = (language?: string): string =>
  copyForLocale(PRERELEASE_BANNER_TEXT_BY_LOCALE, language)

// Shown beside the provider key and before the first model call. Fixed Japanese on every locale.
export const PRERELEASE_DATA_DESTINATION_NOTICE =
  '架空データのみ。リクエストは設定した AI サービス（OpenAI の場合は米国）へ送信されます。利用料金はご自身の契約先から請求されます。'

// Settings → About. Fixed Japanese on every locale; beta builds do not offer an update check.
export const PRERELEASE_UPDATE_NOTICE =
  'テスト版では自動更新は無効です。新しい版は配布元からお知らせします。'

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
