import { afterEach, expect, it } from 'vitest'

import { detectPhi } from '../../phi/detect'
import { installMachineApproval } from '../../phi/gate'
import { PHI_OUTPUT_BLOCK_MESSAGE } from './notebook-phi-release'
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

// #169 review: the token boundary may only excuse a match that could really be a slice of a longer
// number. A hyphenated phone can never be embedded in a float literal, so sitting next to a digit or a
// decimal point must not un-redact it — the first three shapes were released by the too-broad guard.
// The age shape never regressed, and is here so a later change cannot start missing it.
it.each([
  ['a decimal point before it', '1.090-1234-5678'],
  ['a decimal fraction after it', '090-1234-5678.5'],
  ['a year after a sentence period', 'TEL 090-1234-5678.2024'],
  ['an age right before it', '年齢40 090-1234-5678']
] as const)('still redacts a hyphenated phone with %s', (_label, text) => {
  expect(detectPatientPhiSpans(text).map((span) => span.category)).toContain('PHONE')
  const released = redactPatientPhi(text)
  expect(released).toContain('[仮名化済み]')
  expect(released).not.toContain('090-1234-5678')
})

// Known trade-off, accepted deliberately: a bare digit run glued to a decimal is indistinguishable from
// the fraction of a number, so the local layer keeps it rather than corrupt the statistic. It is not a
// hole — the provider gate still sees the run and refuses the whole output.
it('leaves a digit run glued to a decimal to the provider gate', async () => {
  const text = '1.09012345678'
  expect(detectPatientPhiSpans(text)).toEqual([])
  expect(redactPatientPhi(text)).toBe(text)
  expect(await releaseNotebookModelText(text, 'fiction')).toBe(PHI_OUTPUT_BLOCK_MESSAGE)
})

// #170: a summary the beta acceptance wrote was refused because a mean age and a per-N-years rate
// denominator were read as a person's age. A group statistic reaches the model intact; a person's age
// still does not.
it.each([
  '非欠測の平均年齢65歳',
  '年齢10歳当たりOR 1.98',
  'n=12、年齢欠測1例',
  '非欠測の平均年齢65歳、年齢10歳当たりOR 1.98（95%CI 1.20-3.26）、n=12、年齢欠測1例。'
])('releases an aggregate age unchanged: %s', async (text) => {
  expect(await releaseNotebookModelText(text, 'fiction')).toBe(text)
})

it.each(['患者は65歳で糖尿病の既往がある。', '65歳、男性。', '65歳以上', '10歳代', '満65歳'])(
  'still refuses a person age: %s',
  async (text) => {
    expect(await releaseNotebookModelText(text, 'fiction')).toBe(PHI_OUTPUT_BLOCK_MESSAGE)
  }
)

it('still withholds a birth date from the model', async () => {
  const released = await releaseNotebookModelText('生年月日：1970年4月1日', 'fiction')
  expect(released).not.toContain('1970年4月1日')
})

it('redacts a real phone next to statistics without touching the statistics', () => {
  const text = `電話: 090-1234-5678、OR=1.9773051601268752`
  const released = redactPatientPhi(text)
  expect(released).not.toContain('090-1234-5678')
  expect(released).toContain('OR=1.9773051601268752')
})

// #171: the same number has to be recognized by both layers. The local redactor and the provider gate
// are independent rule sets; a shape only one of them sees either leaks in the panel or trips the gate
// on text the panel already showed. The international shapes lost their leading zero after `+81`, and
// the parenthesised shape hid it behind `(`.
it.each([
  [
    'international with spaces',
    '電話: +81 90 1234 5678',
    '+81 90 1234 5678',
    'phone-international'
  ],
  [
    'international with hyphens',
    '電話: +81 90-1234-5678',
    '+81 90-1234-5678',
    'phone-international'
  ],
  ['parenthesised area code', '電話: (03)1234-5678', '(03)1234-5678', 'phone-parenthesized-area'],
  ['domestic hyphenated', '電話: 090-1234-5678', '090-1234-5678', 'phone-bare-hyphenated']
] as const)('catches a %s number in both layers', (_label, text, value, gateRule) => {
  const released = redactPatientPhi(text)
  expect(released).toContain('[仮名化済み]')
  expect(released).not.toContain(value)
  expect(detectPatientPhiSpans(text).map((span) => span.category)).toContain('PHONE')
  const gate = detectPhi(text).filter((span) => span.category === 'PHONE')
  expect(gate.map((span) => span.rule)).toEqual([gateRule])
  expect(gate.map((span) => span.text)).toEqual([value])
})

// A year in parentheses is not an area code. Requiring the area code to start with `0` is what keeps
// this shape out of both layers; widening it to any digits would take this whole string as a phone.
it('does not take a parenthesised year for an area code', () => {
  const text = '抄録(2024)1234-5678'
  expect(detectPatientPhiSpans(text)).toEqual([])
  expect(detectPhi(text).filter((span) => span.category === 'PHONE')).toEqual([])
})

// #175: a Japanese IME types full-width digits and punctuation by default, and every rule was ASCII.
// Folding happens before matching in both layers, so the same number now reads the same way everywhere.
// U+2212 MINUS SIGN is its own row: Unicode normalization folds full-width digits but leaves it alone,
// which is why the gate folded the digits and still missed the number.
it.each([
  ['full-width parens with U+2212', '電話: （０３）１２３４\u2212５６７８'],
  ['full-width parens with U+FF0D', '電話: （０３）１２３４\uff0d５６７８'],
  ['full-width parens with an ASCII hyphen', '電話: （０３）１２３４-５６７８'],
  ['full-width digits with ASCII hyphens', '電話: ０３０-１２３４-５６７８'],
  ['full-width digits with U+2212', '電話: ０３０\u2212１２３４\u2212５６７８'],
  ['half-width digits with U+2212', '電話: 030\u22121234\u22125678'],
  ['full-width plus and digits', '電話: ＋８１ ９０ １２３４ ５６７８']
] as const)('redacts a %s number in both layers', (_label, text) => {
  const [span] = detectPatientPhiSpans(text).filter((candidate) => candidate.category === 'PHONE')
  expect(span).toBeDefined()
  // Offsets and text index the original string, never the folded one.
  expect(text.slice(span!.start, span!.end)).toBe(span!.text)
  expect(span!.text).toMatch(/[０-９＋（）\u2212\uff0d]/u)

  const released = redactPatientPhi(text)
  expect(released).toContain('[仮名化済み]')
  expect(released).not.toContain(span!.text)
  expect(detectPhi(text).some((candidate) => candidate.category === 'PHONE')).toBe(true)
})

// Folding must not turn an ordinary number into a phone. Neither layer anchors on bare digits, so a
// full-width identifier and a number without an area code stay untouched.
it('does not fabricate a phone from a full-width identifier or an area-code-less number', () => {
  for (const text of ['第１２３４号', '１２３４\u2212５６７８']) {
    expect(redactPatientPhi(text)).toBe(text)
    expect(detectPatientPhiSpans(text)).toEqual([])
    expect(detectPhi(text).filter((span) => span.category === 'PHONE')).toEqual([])
  }
})

// #161's known trade-off, unchanged by the fold: a digits-only run glued to a decimal is left to the
// provider gate, in full width exactly as in half width.
it('leaves a full-width decimal continuation to the provider gate, like the half-width one', async () => {
  const text = '１.０９０１２３４５６７８'
  expect(detectPatientPhiSpans(text)).toEqual([])
  expect(redactPatientPhi(text)).toBe(text)
  expect(await releaseNotebookModelText(text, 'fiction')).toBe(PHI_OUTPUT_BLOCK_MESSAGE)
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
