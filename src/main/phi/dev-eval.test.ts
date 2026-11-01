import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { deidentify } from './deidentify'
import { detectPhi } from './detect'
import { scoreFixture } from './score'
import { createMemoryPhiVault } from './store'

const FIXTURE = join(__dirname, '../../../test/fixtures/jp-phi-testset')
const SHORT_FIXTURE = join(__dirname, '../../../test/fixtures/jp-phi-short-records')

// The baseline pinned by #95, kept as the hard ceiling for every later detector change: a record may
// leave this set, never enter it. A new false positive has to fail here, not in review.
const BASELINE_FLAGGED = [
  'var-reported-tsv.txt',
  'var-age-unit.txt',
  'var-sex-categorical.txt',
  'var-sbp.txt',
  'var-smoking.txt',
  'var-endpoint.txt',
  'var-facility.txt',
  'var-consent-date.txt',
  'var-drug.txt',
  'var-dose.txt',
  'var-ward.txt',
  'var-long-definition.txt',
  'label-age-only.txt',
  'label-sex-only.txt',
  'term-chi-square.txt',
  'term-double-blind.txt',
  'term-colorectal-screening.txt',
  'term-postop-complication.txt',
  'term-lung-cancer-study.txt',
  'known-lung-cancer.txt',
  'known-internal-medicine.txt',
  'known-male.txt',
  'known-levofloxacin.txt',
  'known-survival-rate.txt',
  'known-chemotherapy.txt'
]
// Every removal above is one reviewed vocabulary entry in ordinary-label.ts:
//   var-sex-categorical, label-sex-only  <- 性別
//   var-smoking                          <- 喫煙歴
//   var-facility                         <- 施設名
//   var-drug                             <- 薬剤名 + 一般名
//   var-ward                             <- 病棟
//   var-endpoint                         <- 主要評価項目
//   term-chi-square                      <- 統計学的有意差
//   term-double-blind                    <- 二重盲検比較試験
// The rest are cleared by structure, not by a list: tab cells, punctuation segments, and unit slots.
// The six known limitations are the reviewed-vocabulary set too; レボフロキサシン is the one entry
// still missing, so it stays pinned until someone adds it with a reason.
const PINNED_FLAGGED = ['known-hex-leading-zero.txt', 'known-levofloxacin.txt']

type ShortReport = {
  records: number
  covered: boolean
  nameGold: number
  nameOverlapRecall: number
  nameExactRecall: number
  nameMisses: Array<{ record: string; text: string }>
  mustCleanDecoys: number
  mustCleanFlagged: number
  mustCleanRate: number
  knownDecoys: number
  knownFlagged: number
  flagged: Array<{ record: string; text: string }>
  mixed: { gold: number; detected: number; redacted: number; records: string[] }
}

describe('Japanese PHI dev set', () => {
  it('meets the published dev thresholds and prints the score table', () => {
    process.env.EVAL_DATE = '2026-10-13'
    const report = scoreFixture(FIXTURE)
    const serialized = JSON.stringify(report, null, 2)
    if (process.env.PHI_EVAL_REPORT) writeFileSync(process.env.PHI_EVAL_REPORT, serialized)
    process.stderr.write(`${serialized}\n`)
    expect(report.ok).toBe(true)
    // The aggregate set must never be read as coverage of the short-record branch. If this flips to
    // true, someone added short records to the main set and the separate numbers below stop being
    // independent.
    expect((report.shortRecords as { records: number }).records).toBe(0)
  })

  it('scores the short-record subset on its own', () => {
    process.env.EVAL_DATE = '2026-10-13'
    const report = scoreFixture(SHORT_FIXTURE)
    const short = report.shortRecords as ShortReport
    process.stderr.write(`${JSON.stringify(short, null, 2)}\n`)

    expect(short.covered).toBe(true)
    expect(short.records).toBe(48)
    // Recall is the hard line: every name is found, and found exactly. The three name-with-* records
    // are the ones the old whole-string guess dropped whenever another span was present.
    expect(short.nameGold).toBe(14)
    expect(short.nameOverlapRecall).toBe(1)
    expect(short.nameExactRecall).toBe(1)
    expect(short.nameMisses).toEqual([])
    // False positives: the variable-dictionary and term rows are now clean, and the two hexadecimal
    // tool records stay released. A rise here is a regression in a rule, not a threshold to adjust.
    expect(short.mustCleanDecoys).toBe(21)
    expect(short.mustCleanRate).toBe(0)
    // Monotonic decrease, executable, in two layers:
    //   1. the exact flagged set is pinned below, so a record entering or leaving fails either way;
    //   2. a must-clean record may never (re)enter it: the #95 baseline is that group's hard ceiling.
    // `known-*` records are flagged by definition and are pinned by the exact set, so they are not
    // measured against the must-clean ceiling.
    expect(
      short.flagged.filter(
        (item) => !item.record.startsWith('known-') && !BASELINE_FLAGGED.includes(item.record)
      )
    ).toEqual([])
    // The full flagged set is asserted, not its size: one record leaving and another entering would
    // keep the counts equal and slip past a numeric check.
    expect(short.flagged.map((item) => item.record).sort()).toEqual(PINNED_FLAGGED)
    expect(short.knownFlagged).toBe(PINNED_FLAGGED.length)
    // Records carrying another PHI span: the labelled detectors still run there while the row stays
    // readable.
    expect(short.mixed).toEqual({
      gold: 3,
      detected: 3,
      redacted: 3,
      records: [
        'mixed-date-alongside.txt',
        'mixed-karte-alongside.txt',
        'mixed-phone-alongside.txt'
      ]
    })
  })

  // The defect this ticket closes: the guess used to require that the whole text carried no other
  // span, so a name next to an age or a date was never masked at all.
  it.each([
    ['山田太郎 65歳', 0, 4, 5, 8],
    ['山田太郎 2026-10-01', 0, 4, 5, 15],
    ['山田太郎 65歳 男性', 0, 4, 5, 8]
  ])('masks the name beside another span in %s', (text, nameStart, nameEnd, dateStart, dateEnd) => {
    const spans = detectPhi(text)
    const name = spans.find((span) => span.category === 'PERSON_NAME')
    const date = spans.find((span) => span.category === 'DATE')
    expect([name?.start, name?.end]).toEqual([nameStart, nameEnd])
    expect([date?.start, date?.end]).toEqual([dateStart, dateEnd])
    const result = deidentify(text, createMemoryPhiVault().store('fiction'))
    expect(result.text).not.toContain('山田太郎')
    expect(result.text).not.toContain('65歳')
    expect(result.text).not.toContain('2026-10-01')
  })

  // The same defect one line down: a pasted note puts the name on one line and the age on the next,
  // and the name then sits alone on its line. It must not be read as a heading.
  it('masks a name that shares a record with an age on the next line', () => {
    const text = readFileSync(join(SHORT_FIXTURE, 'records', 'name-with-age-newline.txt'), 'utf8')
    const spans = detectPhi(text)
    const name = spans.find((span) => span.category === 'PERSON_NAME')
    const date = spans.find((span) => span.category === 'DATE')
    expect([name?.start, name?.end, name?.text]).toEqual([0, 4, '山田太郎'])
    expect([date?.start, date?.end]).toEqual([5, 8])
    expect(deidentify(text, createMemoryPhiVault().store('fiction')).text).not.toContain('山田太郎')
  })

  // The name guess is bounded at 80 characters. Pinned as a miss, not as desired behaviour: the
  // record exists so the gap is measured, and it is owned by issue #103, which extends the window.
  it('pins the long-record gap: an unlabeled name past 80 characters stays unmasked', () => {
    const text = readFileSync(
      join(SHORT_FIXTURE, 'records', 'known-long-name-unmasked.txt'),
      'utf8'
    )
    expect(text.length).toBeGreaterThan(80)
    expect(text.startsWith('山田太郎')).toBe(true)
    expect(detectPhi(text).filter((span) => span.category === 'PERSON_NAME')).toEqual([])
  })

  // A romanized name is exported as SURNAME, GIVEN. That is the only shape in this branch that has
  // to survive a comma, which is otherwise a segment separator.
  it.each(['Smith, John', 'MISONO, KOTARO'])('keeps %s as one name', (text) => {
    expect(detectPhi(text).filter((span) => span.category === 'PERSON_NAME')).toHaveLength(1)
  })

  // The beta.20 incident: eight digits inside a hexadecimal identifier were read as an insurer number
  // and blocked five sends before the sixth failed. The rule is not windowed at 80 characters, so the
  // artifact record below is long on purpose.
  it.each([
    ['tool-artifact-metadata.txt', '02852897'],
    ['tool-uuid-tail.txt', '02852897'],
    ['tool-hex-hash.txt', '1234567890']
  ])('%s is released although it contains %s', (record, digits) => {
    const text = readFileSync(join(SHORT_FIXTURE, 'records', record), 'utf8')
    expect(text).toContain(digits)
    expect(detectPhi(text).filter((span) => span.category === 'INSURER_NO')).toEqual([])
  })

  // The same tight lookahead must not cost a real law code: labelled, bare inside a sentence, and with
  // a branch suffix. `02123456` carries law-code prefix 02, so it is a valid insurer number.
  it.each([
    ['insurer-labeled.txt', 6, 14],
    ['insurer-bare.txt', 4, 12],
    ['insurer-branch.txt', 0, 8]
  ])('%s still yields its insurer number', (record, start, end) => {
    const text = readFileSync(join(SHORT_FIXTURE, 'records', record), 'utf8')
    const spans = detectPhi(text).filter((span) => span.category === 'INSURER_NO')
    expect(spans.map((span) => [span.start, span.end, span.text])).toEqual([
      [start, end, '02123456']
    ])
  })

  // A UUID's first segment is eight hexadecimal characters too, bounded by `"` and `-`, so the
  // trailing-letter lookahead alone does not cover it.
  it('rejects the first segment of a UUID', () => {
    const text = '"version_id": "02852897-9f2b-4183-a8f3-1e2210368817"'
    expect(detectPhi(text).filter((span) => span.category === 'INSURER_NO')).toEqual([])
  })
})
