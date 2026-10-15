import { resolveLocaleFromTags, type Locale } from './locale'

// UI language tags, including region forms such as zh-CN, map onto the locales the shell paints.
// Anything unsupported resolves to English, the same fallback as the rest of the interface.
export const copyLocale = (language?: string): Locale =>
  resolveLocaleFromTags(language ? [language] : [])

export const copyForLocale = <T>(catalogs: Record<Locale, T>, language?: string): T =>
  catalogs[copyLocale(language)]
