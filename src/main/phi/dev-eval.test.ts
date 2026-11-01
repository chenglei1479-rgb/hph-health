import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { scoreFixture } from './score'

const FIXTURE = join(__dirname, '../../../test/fixtures/jp-phi-testset')
const SHORT_FIXTURE = join(__dirname, '../../../test/fixtures/jp-phi-short-records')

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
    const short = report.shortRecords as {
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
    }
    process.stderr.write(`${JSON.stringify(short, null, 2)}\n`)

    expect(short.covered).toBe(true)
    expect(short.records).toBe(38)
    // Recall: every name must be found, and the span must be the name itself, not the whole cell.
    expect(short.nameOverlapRecall).toBe(1)
    expect(short.nameExactRecall).toBe(1)
    expect(short.nameMisses).toEqual([])
    // False positives: a variable dictionary cell that carries no name label is not a patient.
    expect(short.mustCleanRate).toBe(0)
    expect(short.mustCleanFlagged).toBe(0)
    // Known limitations are tracked explicitly: the set may shrink, never grow.
    expect(short.knownDecoys).toBe(6)
    expect(short.knownFlagged).toBe(6)
  })
})
