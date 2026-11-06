import { afterEach, expect, it } from 'vitest'

import { installMachineApproval } from '../../phi/gate'
import { installNotebookModelTextReleaser, releaseNotebookModelText } from './release-model-text'
import { detectPatientPhiSpans, formatBlockedImport, redactPatientPhi } from './patient-phi'

afterEach(() => {
  installNotebookModelTextReleaser(null)
  installMachineApproval(null)
})

// #161: these are computed results from the reported session, verified against an independent
// Newton MLE. The PHONE rule used to match the digit run "051601268752" inside the odds ratio, so the
// model received "1.9773[仮名化済み]" — a corrupted number presented as a statistic.
const REPORTED_STATISTICS = 'beta=0.6817348874245852 OR=1.9773051601268752 p=0.15614453071579765'

it('keeps computed statistics intact instead of redacting a slice of them', () => {
  expect(redactPatientPhi(REPORTED_STATISTICS)).toBe(REPORTED_STATISTICS)
  for (const token of ['0.6817348874245852', '1.9773051601268752', '0.15614453071579765'])
    expect(redactPatientPhi(REPORTED_STATISTICS)).toContain(token)
})

it('never splits a decimal number, even when a phone-shaped run sits inside it', () => {
  // "051601268752" and "071579765" both match the phone shape; both continue a decimal.
  for (const value of ['1.9773051601268752', '0.15614453071579765', '0.6817348874245852'])
    expect(redactPatientPhi(`OR=${value}`)).toBe(`OR=${value}`)
  expect(redactPatientPhi(REPORTED_STATISTICS)).not.toContain('[仮名化済み]')
})

it('releases the reported statistics unchanged to the model', async () => {
  const released = await releaseNotebookModelText(
    `【結果】ロジスティック回帰 ${REPORTED_STATISTICS}`,
    'fiction'
  )
  expect(released).toContain('OR=1.9773051601268752')
  expect(released).toContain('p=0.15614453071579765')
  expect(released).not.toContain('[仮名化済み]')
})

// Recall red lines: the token boundary must not release identifiers that were caught before.
it.each([
  ['labeled name', '患者氏名: 山田太郎', 'PERSON_NAME', '山田太郎'],
  ['labeled address', '住所: 東京都千代田区1-2-3', 'ADDRESS', '千代田区'],
  ['karte number', 'カルテ番号: A1234', 'KARTE_NO', 'A1234'],
  ['patient id', '患者ID: P98765', 'KARTE_NO', 'P98765'],
  ['phone', '電話: 090-1234-5678', 'PHONE', '090-1234-5678'],
  ['bare phone', '連絡先 0312345678', 'PHONE', '0312345678'],
  ['email', 'mail: taro@example.jp', 'EMAIL', 'taro@example.jp'],
  ['my number', 'マイナンバー: 123456789012', 'MY_NUMBER', '123456789012'],
  ['insurer', '保険者番号: 12345678', 'INSURER_NO', '12345678'],
  // `保険者番号` is a substring of `被保険者番号`, and the insurer rule runs first, so this label is
  // reported under that category. The value is still withheld; only the category name overlaps.
  ['insured number', '被保険者番号: 9876543', 'INSURER_NO', '9876543'],
  ['insured symbol', '記号番号: 7654321', 'INSURED_ID', '7654321']
] as const)('still redacts a %s', (_label, text, category, value) => {
  expect(detectPatientPhiSpans(text).map((span) => span.category)).toContain(category)
  const released = redactPatientPhi(text)
  expect(released).toContain('[仮名化済み]')
  expect(released).not.toContain(value)
})

it('redacts a real phone next to statistics without touching the statistics', () => {
  const text = `電話: 090-1234-5678、OR=1.9773051601268752`
  const released = redactPatientPhi(text)
  expect(released).not.toContain('090-1234-5678')
  expect(released).toContain('OR=1.9773051601268752')
})

// #161 requirement 4: a refusal names what fired, the stable rule id and where, never the value.
it('names the category, rule and offsets in a refusal without the matched text', () => {
  const spans = detectPatientPhiSpans('患者氏名: 山田太郎、メール: taro@example.jp')
  expect(spans.map((span) => span.category).sort()).toEqual(['EMAIL', 'PERSON_NAME'])
  expect(spans.map((span) => span.rule).sort()).toEqual(['schema-email', 'schema-name-label'])
  const message = formatBlockedImport(spans)
  for (const text of ['PERSON_NAME', 'EMAIL', 'schema-name-label', 'schema-email']) {
    expect(message).toContain(text)
  }
  expect(message).not.toContain('山田太郎')
  expect(message).not.toContain('taro@example.jp')
  for (const span of spans) expect(span.reason).not.toContain(span.text)
})
