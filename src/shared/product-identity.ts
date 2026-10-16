// User-visible product name for the window title, home header, menu bar, about
// panel, disclaimers, and native dialog titles. Change this one value to rename
// those surfaces.
//
// Installer productName, bundle display names, HTML <title>, and the web app
// manifest still duplicate the current value. src/main/app-branding.test.ts
// fails if the installer and HTML titles drift from this constant.
//
// The Electron userData directory and keychain/credential service names are
// pinned separately and must not follow this value.
export const PRODUCT_DISPLAY_NAME = 'Baselio'

// Japanese prose uses katakana. The Latin wordmark stays PRODUCT_DISPLAY_NAME.
export const PRODUCT_DISPLAY_NAME_JA = 'ベースリオ'

// Legal name of the company that operates the product, used in disclosures.
// Leave empty until the real name is known. Empty renders a marked placeholder
// instead of omitting the provider.
export const OPERATOR_COMPANY_LEGAL_NAME = ''

// The development code name must not be written into a manuscript. Any other
// non-empty PRODUCT_DISPLAY_NAME is treated as the public name.
const DEVELOPMENT_CODE_NAME = 'DRA'

export const productNameIsPublic = (name: string): boolean => {
  const trimmed = name.trim()
  return trimmed.length > 0 && trimmed !== DEVELOPMENT_CODE_NAME
}

export const localizedProductDisplayName = (locale: string | undefined): string => {
  const language = locale?.toLowerCase() ?? ''
  if (language === 'ja' || language.startsWith('ja-')) return PRODUCT_DISPLAY_NAME_JA
  return PRODUCT_DISPLAY_NAME
}

// Standalone development-code token in already-resolved UI copy. Identifiers
// such as DRA_MEMBERSHIP_REQUIRED and paths such as .dra/ stay unchanged.
const DEVELOPMENT_CODE_PATTERN = /(?<![\p{L}\p{N}_])DRA(?![\p{L}\p{N}_])/gu

const JA_PROSE_AFTER_NAME = new RegExp(
  `${PRODUCT_DISPLAY_NAME_JA} (?=[\\p{Script=Hiragana}\\p{Script=Han}])`,
  'gu'
)

export const replaceVisibleDevelopmentCode = (
  value: string,
  locale: string | undefined
): string => {
  if (!value.includes(DEVELOPMENT_CODE_NAME)) return value
  const replaced = value.replace(DEVELOPMENT_CODE_PATTERN, localizedProductDisplayName(locale))
  // Catalogs keep a space after the Latin development code. Japanese prose
  // does not put that space before hiragana or kanji.
  if (localizedProductDisplayName(locale) !== PRODUCT_DISPLAY_NAME_JA) return replaced
  return replaced.replace(JA_PROSE_AFTER_NAME, PRODUCT_DISPLAY_NAME_JA)
}
