import { readFileSync } from 'node:fs'

import { expect, it } from 'vitest'

import { buildDemoReadmission } from '../../../scripts/demo-readmission/generate.mjs'
import { sampleAbstracts } from './sample-abstracts'

const JA_LINE = '架空のデータによるデモです。実在の患者・研究結果ではありません'
const SIMPLIFIED_ONLY = '设网软数据夹缓认项连组织际检验证权应务边浅业开关闭结'
const TRADITIONAL_ONLY = '設網軟數據夾緩認項連組織際檢驗證權應務邊淺業開關閉結'

it('ships the seeded fictional cohort and a static abstract with the required labels', () => {
  const built = buildDemoReadmission()
  expect(built.rows).toHaveLength(240)
  expect(new Set(built.rows.map((row) => row.provenance))).toEqual(new Set(['SYNTHETIC']))
  expect(built.rows.every((row) => row.record_id.startsWith('SYNTH-'))).toBe(true)
  expect(Object.keys(built.rows[0] ?? {})).toEqual([
    'record_id',
    'provenance',
    'age_band',
    'sex',
    'los_days',
    'readmitted_30d'
  ])
  const csv = readFileSync('resources/demo-readmission/cohort.csv', 'utf8')
  expect(csv.trim().split('\n')).toHaveLength(241)
  expect(sampleAbstracts.documents.ja.html).toBe(built.documents.ja.html)
  expect(readFileSync('resources/demo-readmission/abstract.ja.html', 'utf8')).toBe(
    built.documents.ja.html
  )

  for (const locale of ['ja', 'zh-Hans', 'zh-Hant', 'en'] as const) {
    const html = built.documents[locale].html
    const pages = built.documents[locale].pages
    expect(pages).toHaveLength(3)
    expect(html.match(/class="page"/g)).toHaveLength(3)
    for (const item of pages) {
      expect(item.disclaimer.length).toBeGreaterThan(0)
      expect(item.footerDisclaimer).toBe(item.disclaimer)
      expect(item.footerMark).toBe('DRA デモ')
      const titleAt = html.indexOf(`<h1>${item.title}</h1>`)
      const disclaimerAt = html.indexOf(`<p class="disclaimer">${item.disclaimer}</p>`, titleAt)
      expect(disclaimerAt).toBeGreaterThan(titleAt)
    }
    expect(html.match(/DRA デモ/g)).toHaveLength(3)
  }

  expect(built.documents.ja.html.split(JA_LINE).length - 1).toBe(6)
  expect(built.documents['zh-Hans'].html).not.toContain(JA_LINE)
  expect(built.documents.en.html).not.toContain(JA_LINE)
  expect(built.documents['zh-Hans'].html).not.toMatch(
    /[設網軟數據夾緩認項連組織際檢驗證權應務邊淺業開關閉結]/
  )
  expect(built.documents['zh-Hant'].html).not.toMatch(
    /[设网软数据夹缓认项连组织际检验证权应务边浅业开关闭结]/
  )
  expect(built.documents.ja.html).not.toMatch(/まもなく|soon|shortly/)

  const source = readFileSync('scripts/demo-readmission/generate.mjs', 'utf8')
  expect(source).not.toMatch(/fetch\(|https?:\/\/|wisp-science/)
  expect(source).not.toContain(SIMPLIFIED_ONLY)
  expect(source).not.toContain(TRADITIONAL_ONLY)
})
