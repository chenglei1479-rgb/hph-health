import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const FORBIDDEN_JAPANESE_TERMS = [
  '匿名化',
  '匿名統計',
  '診断支援',
  '診断補助',
  '治療方針',
  '治療判断',
  '臨床判断支援'
]

/**
 * Japanese product UI. The settings page renders the endpoint catalog fields,
 * so that file is UI copy even though generated notices quote the same rows.
 */
const UI_STRING_FILES = [
  'src/shared/i18n/locales/ja.json',
  'resources/external-endpoints.json'
] as const

/**
 * Legal and explanatory documents may need to name the APPI category, for
 * example 「これは匿名加工情報ではありません」. Paths are explicit files, not globs.
 * Consent and FAQ entries stay listed when those files are not in this branch.
 */
const LEGAL_EXPLANATORY_ALLOWLIST = [
  'docs/privacy/usage-notice.ja.md',
  'docs/privacy/faq.ja.md',
  'docs/hospital-it-allowlist.md',
  'resources/account-consent.json',
  'resources/terms-of-use.json'
] as const

const uiStringFiles = (candidates: readonly string[]): string[] =>
  candidates.filter((file) => !(LEGAL_EXPLANATORY_ALLOWLIST as readonly string[]).includes(file))

/**
 * `diagnostic` and `diagnostics` name log export. Every other `diagnos*` form,
 * including diagnosis and diagnosing, is medical-device wording. So is
 * `diagnostic support` or `diagnostic aid`.
 */
const englishDeviceHits = (text: string): string[] => {
  const hits: string[] = []
  let diagnos = false
  for (const match of text.matchAll(/diagnos\w*/gi)) {
    const word = match[0].toLowerCase()
    if (word === 'diagnostic' || word === 'diagnostics') continue
    diagnos = true
    break
  }
  if (/\bdiagnostics?\s+(support|aid)\b/i.test(text)) diagnos = true
  if (diagnos) hits.push('diagnos')
  if (/treatment decision/i.test(text)) hits.push('treatment decision')
  return hits
}

const hitsIn = (file: string, text: string): string[] => [
  ...FORBIDDEN_JAPANESE_TERMS.filter((term) => text.includes(term)).map(
    (term) => `${file}: ${term}`
  ),
  ...englishDeviceHits(text).map((term) => `${file}: ${term}`)
]

const hitsInFiles = (files: readonly string[], read: (file: string) => string): string[] =>
  uiStringFiles(files).flatMap((file) => hitsIn(file, read(file)))

describe('Japanese terminology', () => {
  it('flags 匿名化 in a UI string and skips allowlisted legal documents', () => {
    const texts: Record<string, string> = {
      'src/shared/i18n/locales/ja.json': '画面に匿名化と出る',
      'docs/privacy/usage-notice.ja.md':
        'これは匿名加工情報ではありません。説明のために匿名化という語を使います。',
      'docs/privacy/faq.ja.md': '匿名統計ではなく、これは匿名加工情報ではありません。',
      'resources/account-consent.json': 'これは匿名加工情報ではありません',
      'resources/terms-of-use.json': '匿名化は法律上の用語です',
      'docs/hospital-it-allowlist.md': 'この説明文書には匿名化を書けます'
    }
    const hits = hitsInFiles(Object.keys(texts), (file) => texts[file] ?? '')
    expect(hits).toEqual(['src/shared/i18n/locales/ja.json: 匿名化'])
  })

  it('does not treat the legal sentence as a UI-string failure', () => {
    const hits = hitsInFiles(
      ['docs/privacy/usage-notice.ja.md'],
      () => 'これは匿名加工情報ではありません'
    )
    expect(hits).toEqual([])
  })

  it('flags medical-device wording in UI strings and skips the same allowlist', () => {
    const texts: Record<string, string> = {
      'src/shared/i18n/locales/ja.json':
        '診断支援と診断補助。治療方針、治療判断、臨床判断支援。A diagnosis and a treatment decision.',
      'docs/privacy/usage-notice.ja.md':
        'これは匿名加工情報ではありません。診断支援という語と diagnosis と treatment decision を説明に使います。',
      'docs/privacy/faq.ja.md': '臨床判断支援ではありません。研究支援です。',
      'resources/account-consent.json': '治療判断という法律上の説明'
    }
    const hits = hitsInFiles(Object.keys(texts), (file) => texts[file] ?? '')
    expect(hits).toEqual([
      'src/shared/i18n/locales/ja.json: 診断支援',
      'src/shared/i18n/locales/ja.json: 診断補助',
      'src/shared/i18n/locales/ja.json: 治療方針',
      'src/shared/i18n/locales/ja.json: 治療判断',
      'src/shared/i18n/locales/ja.json: 臨床判断支援',
      'src/shared/i18n/locales/ja.json: diagnos',
      'src/shared/i18n/locales/ja.json: treatment decision'
    ])
  })

  it('allows the log-export name diagnostic and still flags diagnostic support', () => {
    expect(englishDeviceHits('Diagnostics and a diagnostic snapshot')).toEqual([])
    expect(englishDeviceHits('This product is diagnostic support')).toEqual(['diagnos'])
    expect(englishDeviceHits('The product is 研究支援')).toEqual([])
  })

  it('lists privacy notice, FAQ, and consent files on the allowlist', () => {
    expect(LEGAL_EXPLANATORY_ALLOWLIST.every((file) => !file.includes('*'))).toBe(true)
    expect([...LEGAL_EXPLANATORY_ALLOWLIST]).toEqual([
      'docs/privacy/usage-notice.ja.md',
      'docs/privacy/faq.ja.md',
      'docs/hospital-it-allowlist.md',
      'resources/account-consent.json',
      'resources/terms-of-use.json'
    ])
    expect(uiStringFiles([...UI_STRING_FILES, ...LEGAL_EXPLANATORY_ALLOWLIST])).toEqual([
      ...UI_STRING_FILES
    ])
  })

  it('fails if 匿名化 or medical-device wording appears in Japanese UI strings', () => {
    const root = process.cwd()
    const hits = hitsInFiles(UI_STRING_FILES, (file) => readFileSync(join(root, file), 'utf8'))
    expect(hits).toEqual([])
  })

  it('describes the product as 研究支援', () => {
    const catalog = readFileSync(join(process.cwd(), 'src/shared/i18n/locales/ja.json'), 'utf8')
    expect(catalog).toContain('研究支援専用です')
    expect(catalog).toContain('研究支援として医学研究を支援してください')
  })
})
