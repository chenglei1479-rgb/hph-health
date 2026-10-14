import { readFileSync, writeFileSync } from 'node:fs'

import { expect, it } from 'vitest'

import {
  renderHospitalAllowlistMarkdown,
  replaceExternalTransmissionsSection
} from '../src/shared/external-endpoint-docs'

const NOTICE = 'docs/privacy/usage-notice.ja.md'
const HOSPITAL = 'docs/hospital-it-allowlist.md'

const expectedNotice = (): string =>
  replaceExternalTransmissionsSection(readFileSync(NOTICE, 'utf8'))

it('keeps the privacy notice and hospital allowlist in sync with the endpoint catalog', () => {
  const notice = expectedNotice()
  const hospital = renderHospitalAllowlistMarkdown()
  if (process.env.UPDATE_EXTERNAL_ENDPOINT_DOCS === '1') {
    writeFileSync(NOTICE, notice)
    writeFileSync(HOSPITAL, hospital)
  }
  expect(readFileSync(NOTICE, 'utf8')).toBe(notice)
  expect(readFileSync(HOSPITAL, 'utf8')).toBe(hospital)
  expect(notice).toContain('## 外部送信')
  expect(notice).not.toContain('【')
  expect(notice).not.toContain('】')
  expect(hospital).toContain('dra-prod.jp.auth0.com')
  expect(hospital).toContain('stats.REPLACE_ME')
  expect(notice).toContain('利用者が設定した AI サービス')
  expect(notice).toContain('表の構造、合成サンプル、マスキングチェック済みの出力')
  expect(notice).toContain('仮名化済み本文')
  expect(hospital).toContain('利用状況統計（個人を特定しない）')
  expect(hospital).toContain('利用者が設定した AI サービス')
  expect(hospital).toContain('利用者が選んだ提供者の規約')
  expect(hospital).not.toContain('【')
  expect(hospital).not.toContain('】')
})
