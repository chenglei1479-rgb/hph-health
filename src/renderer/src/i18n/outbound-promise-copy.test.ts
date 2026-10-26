// Guards the founder-locked outbound-promise tone on the release / first-run / home / account
// surfaces. The canonical wording is build/prerelease-release-notes.md: fictional data only, requests
// go to the configured AI service (the United States when that service is OpenAI), and local analysis
// is not a zero-outbound claim. Natural-language keys mean an English rewrite changes the catalog key,
// so this suite also pins the replacement keys to every translated locale.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import de from '../../../shared/i18n/locales/de.json'
import es from '../../../shared/i18n/locales/es.json'
import fr from '../../../shared/i18n/locales/fr.json'
import ja from '../../../shared/i18n/locales/ja.json'
import ko from '../../../shared/i18n/locales/ko.json'
import ru from '../../../shared/i18n/locales/ru.json'
import zhHans from '../../../shared/i18n/locales/zh-Hans.json'
import zhHant from '../../../shared/i18n/locales/zh-Hant.json'
import {
  PRERELEASE_DATA_DESTINATION_NOTICE,
  PRERELEASE_DATA_USE_NOTICE
} from '../../../shared/prerelease'

const CATALOGS = { ja, ko, fr, ru, de, es, 'zh-Hans': zhHans, 'zh-Hant': zhHant } as const
type Locale = keyof typeof CATALOGS
const LOCALES = Object.keys(CATALOGS) as Locale[]

const releaseNotes = readFileSync(
  join(__dirname, '../../../../build/prerelease-release-notes.md'),
  'utf8'
)

const canonicalJapanese =
  '氏名・患者IDなど直接識別子の送信を防ぐため、送信前チェックと制限があります。絶対保証ではありません。'
const canonicalChinese =
  '为防止发送姓名、患者ID等直接标识符，设有发送前检查和限制。这并非绝对保证。'

// Blanket zero-outbound promises. Scoped claims such as "never sent to PDF hosts", "nothing is
// uploaded" for a local export, or the turn-level PHI "not sent" messages are accurate and must stay.
const BANNED = [
  /直接識別子(?:は|の列は).*(?:送りません|送信しません|渡しません)/,
  /保証で送りません/,
  /絶対に外に出ない/,
  /direct identifiers[^.]*are not sent/i,
  /直接(?:标识符|識別符)(?:不会发送|不會傳送)/,
  /外部に送信されることはありません/,
  /外部に送信されません/,
  /外部に送信することはありません/,
  /端末外に送信しません/,
  /デバイス外に送信しません/,
  /一切(送信|アップロード)(しません|されません)/,
  /データは外部に出ません/,
  /完全(に)?オフライン/,
  /保证不外发/,
  /绝不外发/,
  /决不外发/,
  /数据不会离开/,
  /不会离开设备/,
  /完全离线/,
  /不上传任何数据/,
  /不会发送到外部/,
  /保證不外發/,
  /絕不外發/,
  /資料不會離開/,
  /完全離線/,
  /不上傳任何資料/,
  /不會傳送到外部/,
  /never leaves? (your|the|this) (device|computer|laptop)/i,
  /data (never|does not|doesn't) leave/i,
  /nothing (ever )?leaves/i,
  /no data leaves/i,
  /zero outbound/i,
  /stays? (entirely )?on your (device|computer) only/i
]

const catalogEntries = (locale: Locale): Array<[string, string]> => {
  const catalog = CATALOGS[locale] as unknown as Record<string, Record<string, string>>
  return Object.values(catalog).flatMap((namespace) => Object.entries(namespace))
}

const rendersSentence = (text: string): boolean =>
  /送信|發送|发送|傳送|전송|[sS]enden|gesendet|envoi|envoy|envío|envían|отправ|sent/i.test(text)

describe('outbound-promise copy', () => {
  it('never makes a blanket zero-outbound claim in any translated key or value', () => {
    const offenders: string[] = []
    for (const locale of LOCALES) {
      for (const [key, value] of catalogEntries(locale)) {
        for (const pattern of BANNED) {
          if (pattern.test(key)) offenders.push(`${locale} key: ${key}`)
          if (pattern.test(value)) offenders.push(`${locale} value: ${value}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps the canonical first-run notice in every translated catalog', () => {
    for (const locale of LOCALES) {
      const renderer = (CATALOGS[locale] as unknown as Record<string, Record<string, string>>)
        .renderer
      const translated = renderer[PRERELEASE_DATA_DESTINATION_NOTICE]
      expect(translated, `${locale} is missing the first-run destination notice`).toBeTruthy()
      expect(translated).not.toBe(PRERELEASE_DATA_DESTINATION_NOTICE)
      expect(rendersSentence(translated ?? '')).toBe(true)
      expect(translated?.toLowerCase()).not.toMatch(/\bnull\b|undefined/)
    }
  })

  it('matches the release-notes tone for Japanese and Simplified Chinese', () => {
    expect(releaseNotes).toContain(canonicalJapanese)
    expect(releaseNotes).toContain(canonicalChinese)
    expect(
      (ja as unknown as Record<string, Record<string, string>>).renderer[
        PRERELEASE_DATA_DESTINATION_NOTICE
      ]
    ).toBe(canonicalJapanese)
    expect(
      (
        (zhHans as unknown as Record<string, Record<string, string>>).renderer[
          PRERELEASE_DATA_DESTINATION_NOTICE
        ] ?? ''
      ).startsWith(canonicalChinese)
    ).toBe(true)
  })

  it('keeps the beta/seed scope and provider destination in every locale', () => {
    expect(releaseNotes).toContain(
      'β／種では架空データのみご利用ください。病院の正式運用・実データは対象外です。'
    )
    expect(releaseNotes).toContain(
      'β／种子阶段请仅使用虚构数据。医院正式运行及真实数据不在适用范围内。'
    )
    expect(releaseNotes).toContain(
      'For beta/seed use, please use fictional data only. Formal hospital operations and real data are out of scope.'
    )
    for (const locale of LOCALES) {
      const renderer = CATALOGS[locale].renderer
      expect(renderer[PRERELEASE_DATA_USE_NOTICE]).toBeTruthy()
      expect(renderer[PRERELEASE_DATA_USE_NOTICE]).toContain('OpenAI')
    }
    expect(
      ja.renderer[PRERELEASE_DATA_USE_NOTICE].startsWith(
        'β／種では架空データのみご利用ください。病院の正式運用・実データは対象外です。'
      )
    ).toBe(true)
  })

  it('does not keep the previous absolute promises as catalog keys', () => {
    for (const locale of LOCALES) {
      const renderer = (CATALOGS[locale] as unknown as Record<string, Record<string, string>>)
        .renderer
      expect(renderer['Research files remain on this computer.']).toBeUndefined()
      expect(renderer['Your key stays private.']).toBeUndefined()
      expect(
        renderer[
          'Baselio analyzes patient data on your PC and sends only information without direct identifiers (such as column names and aggregate results) to AI services. Check your institution’s rules or ask the ethics committee whether this constitutes outsourcing.'
        ]
      ).toBeUndefined()
    }
  })
})
