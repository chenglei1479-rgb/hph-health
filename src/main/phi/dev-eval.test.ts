import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { scoreFixture } from './score'

const FIXTURE = join(__dirname, '../../../test/fixtures/jp-phi-testset')
const SHORT_FIXTURE = join(__dirname, '../../../test/fixtures/jp-phi-short-records')

// Current false positives and the one span-precision miss, pinned so main stays green and any drift
// shows up. The detector ticket narrows the whole-string name guess and turns these into
// nameExactRecall 1 / mustCleanRate 0 / flagged = the six known limitations only.
const CURRENT_MUST_CLEAN_FLAGGED = [
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
  'term-lung-cancer-study.txt'
]
const KNOWN_LIMITATION_FLAGGED = [
  'known-lung-cancer.txt',
  'known-internal-medicine.txt',
  'known-male.txt',
  'known-levofloxacin.txt',
  'known-survival-rate.txt',
  'known-chemotherapy.txt'
]

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
    expect(short.records).toBe(38)
    // Recall: every name is found (overlap 1); one bare 氏名: record is returned as the whole cell
    // instead of the name, so exact recall is 0.9 until the label rule lands with the detector fix.
    expect(short.nameGold).toBe(10)
    expect(short.nameOverlapRecall).toBe(1)
    expect(short.nameExactRecall).toBe(0.9)
    expect(short.nameMisses).toEqual([])
    // False positives, pinned as the current measured set: a variable dictionary cell that carries no
    // name label must not be a patient, which is the target of the detector ticket.
    expect(short.mustCleanDecoys).toBe(19)
    expect(short.mustCleanRate).toBe(1)
    // The full flagged set is asserted, not its size: one decoy leaving and another entering would
    // keep the counts equal and slip past a numeric check.
    expect(short.flagged.map((item) => item.record).sort()).toEqual(
      [...CURRENT_MUST_CLEAN_FLAGGED, ...KNOWN_LIMITATION_FLAGGED].sort()
    )
    // The known limitations are the allowed set once the guess is narrowed; today they are part of the
    // flagged set and must never grow.
    expect(KNOWN_LIMITATION_FLAGGED).toHaveLength(6)
    // Records carrying another PHI span: the guess never fires there, so they prove the labelled
    // detectors still run while the dictionary rows stay readable.
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
})
