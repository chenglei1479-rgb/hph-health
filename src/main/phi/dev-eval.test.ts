import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { scoreFixture } from './score'

const FIXTURE = join(__dirname, '../../../test/fixtures/jp-phi-testset')

describe('Japanese PHI dev set', () => {
  it('meets the published dev thresholds and prints the score table', () => {
    process.env.EVAL_DATE = '2026-10-13'
    const report = scoreFixture(FIXTURE)
    const serialized = JSON.stringify(report, null, 2)
    if (process.env.PHI_EVAL_REPORT) writeFileSync(process.env.PHI_EVAL_REPORT, serialized)
    process.stderr.write(`${serialized}\n`)
    expect(report.ok).toBe(true)
  })
})
