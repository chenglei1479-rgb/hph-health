import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { auditAnswerRecord } from './answer-audit'

type FixtureAnswer = { value: string; expected_evidence: string | null; reask: boolean }
type FixtureCase = {
  id: string
  scenario: string
  answers: Record<string, FixtureAnswer>
  expected: { pending: string[] }
}

const fixtureRoot = resolve('test/fixtures/ethics-rule-cases')
const nodeDocument = JSON.parse(readFileSync(resolve(fixtureRoot, 'nodes.json'), 'utf8')) as {
  nodes: string[]
}
const cases = readFileSync(resolve(fixtureRoot, 'cases.jsonl'), 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line) as FixtureCase)

describe('ethics rule fixture contract', () => {
  it('contains the supplied 18 nodes and 40 unique fictional cases', () => {
    expect(nodeDocument.nodes).toHaveLength(18)
    expect(cases).toHaveLength(40)
    expect(new Set(cases.map(({ id }) => id))).toHaveLength(40)
  })

  it('provides every node for every case and verbatim evidence where asserted', () => {
    for (const testCase of cases) {
      expect(Object.keys(testCase.answers).sort(), testCase.id).toEqual(
        [...nodeDocument.nodes].sort()
      )
      for (const [nodeId, answer] of Object.entries(testCase.answers)) {
        if (answer.expected_evidence !== null) {
          expect(testCase.scenario, `${testCase.id}/${nodeId}`).toContain(answer.expected_evidence)
        }
        if (answer.reask) expect(['不確定', '未回答']).toContain(answer.value)
      }
    }
  })
})

describe('answer audit gate', () => {
  it('forces a fabricated model quote to uncertain and blocks conclusions', () => {
    const result = auditAnswerRecord(
      {
        nodeId: nodeDocument.nodes[0],
        value: '研究',
        answerSource: 'model_extracted',
        evidenceQuote: 'シナリオに存在しない文',
        confirmedBy: 'researcher-1',
        confirmedAt: '2026-10-17T10:00:00+09:00',
        ruleSetVersion: 'r8-beta-0.1'
      },
      cases[0].scenario
    )
    expect(result).toMatchObject({ value: '不確定', mayDetermineOutcome: false, mustReask: true })
    expect(result.errors).toContain('evidence-not-verbatim')
  })

  it('blocks an unconfirmed model extraction even when its quote is verbatim', () => {
    const first = cases[0]
    const evidence = first.answers[nodeDocument.nodes[0]].expected_evidence!
    const result = auditAnswerRecord(
      {
        nodeId: nodeDocument.nodes[0],
        value: '研究',
        answerSource: 'model_extracted',
        evidenceQuote: evidence,
        confirmedBy: null,
        confirmedAt: null,
        ruleSetVersion: 'r8-beta-0.1'
      },
      first.scenario
    )
    expect(result.mayDetermineOutcome).toBe(false)
    expect(result.errors).toContain('confirmation-required')
  })
})
