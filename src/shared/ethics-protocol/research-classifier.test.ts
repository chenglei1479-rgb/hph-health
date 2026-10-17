import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { classifyResearch } from './research-classifier'

type Case = {
  id: string
  answers: Record<string, { value: string }>
  expected: {
    is_research: boolean | null
    law: string
    tokutei: boolean | null
    case_report_track: boolean | null
    exit_to: string | null
  }
}

const cases = readFileSync(resolve('test/fixtures/ethics-rule-cases/cases.jsonl'), 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line) as Case)

describe('deterministic research classification', () => {
  it.each(cases)('$id follows the supplied decision-node answers', (testCase) => {
    const result = classifyResearch(
      Object.fromEntries(
        Object.entries(testCase.answers).map(([node, record]) => [node, record.value])
      )
    )
    expect(result, testCase.id).toEqual({
      isResearch: testCase.expected.is_research ?? null,
      law: testCase.expected.law,
      tokutei: testCase.expected.tokutei ?? null,
      caseReportTrack: testCase.expected.case_report_track ?? null,
      exitTo: testCase.expected.exit_to ?? null
    })
  })
})
