import { describe, expect, it } from 'vitest'

import { hasProhibitedApprovalClaim } from './ethics-protocol/approval-claims'
import { S34_2_RESEARCH_DESIGN_CHECKLIST } from './s34-disclaimers'
import {
  DEFAULT_RESEARCH_PLAN_CHECK_STATE,
  RESEARCH_PLAN_CHECK_STATES,
  RESEARCH_PLAN_CHECK_STATE_LABELS,
  S34_PITFALLS_INITIAL_VISIBLE,
  S34_PITFALLS_TITLE,
  S34_RESEARCH_PLAN_CHECKLIST,
  emptyResearchPlanChecklistDraft,
  normalizeResearchPlanChecklistDraft,
  researchPlanCheckStateOf,
  researchPlanChecklistItemIds
} from './s34-research-plan-checklist'

const block = (id: string) => {
  const found = S34_RESEARCH_PLAN_CHECKLIST.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`missing block ${id}`)
  return found
}

describe('§34 T3 research-plan four questions', () => {
  it('keeps the founder-locked block order', () => {
    expect(S34_RESEARCH_PLAN_CHECKLIST.map((candidate) => candidate.id)).toEqual([
      'design',
      'pitfalls',
      'endpoints',
      'confounding'
    ])
  })

  it('keeps the ② title and 12-item first screen', () => {
    const pitfalls = block('pitfalls')
    expect(pitfalls.title).toBe('Common pitfalls checklist')
    expect(S34_PITFALLS_TITLE).toBe(pitfalls.title)
    expect(S34_PITFALLS_INITIAL_VISIBLE).toBe(12)
    // 13 seeds: the first screen shows 12 and 「Show more」 reveals the last one.
    expect(pitfalls.items).toHaveLength(13)
    expect(pitfalls.items.length - S34_PITFALLS_INITIAL_VISIBLE).toBe(1)
  })

  // #261: the seed copy is translated now, so these strings are i18n keys (AGENTS.md: the key is the
  // English source text). A Japanese character in one of them would ship as a key that no catalog can
  // match, and the reader would see the raw key.
  it('carries English source keys and no Japanese script', () => {
    const copy = S34_RESEARCH_PLAN_CHECKLIST.flatMap((candidate) => [
      candidate.title,
      candidate.question,
      ...candidate.items.map((item) => item.label)
    ])
    for (const text of copy) {
      expect(text, JSON.stringify(text)).not.toMatch(/[\p{Script=Hiragana}\p{Script=Katakana}]/u)
      expect(text.length).toBeGreaterThan(0)
    }
    expect(block('design').items.map((item) => item.label)).toEqual([
      'Retrospective cohort (follow-up of existing data)',
      'Case-control',
      'Cross-sectional study',
      'Prospective observation',
      'Single-group before-and-after comparison',
      'The table columns alone are not enough to judge the design (Needs check)'
    ])
    expect(block('design').question).toContain('variable definition table')
    expect(block('endpoints').items).toHaveLength(5)
    expect(block('confounding').items).toHaveLength(5)
    expect(block('endpoints').items[0]?.label).toBe('The primary endpoint is not narrowed down to one')
    expect(block('confounding').items[3]?.label).toBe(
      'The selection-bias argument from exclusions is missing'
    )
    // The constrained wording from the medical review.
    expect(block('design').items[5]?.label).toContain('(Needs check)')
    expect(block('pitfalls').items.find((item) => item.id === 'pitfalls:stopping')?.label).toContain(
      'stopping follow-up'
    )
    expect(
      block('pitfalls').items.find((item) => item.id === 'pitfalls:sample-size')?.label
    ).toContain('sample-size rationale')
    expect(
      block('pitfalls').items.find((item) => item.id === 'pitfalls:endpoint-operational')?.label
    ).toContain('not operational')
    expect(block('endpoints').items[4]?.label).toContain('not settled')
  })

  it('offers four stable state ids with Not set as the default, and English labels', () => {
    expect(RESEARCH_PLAN_CHECK_STATES).toEqual([
      'needs-check',
      'applies',
      'not-applies',
      'unset'
    ])
    expect(DEFAULT_RESEARCH_PLAN_CHECK_STATE).toBe('unset')
    expect(RESEARCH_PLAN_CHECK_STATE_LABELS).toEqual({
      'needs-check': 'Needs check',
      applies: 'Applies',
      'not-applies': 'Does not apply',
      unset: 'Not set'
    })
    // The medical review vetoes wording that reads as "someone is checking this for you".
    for (const label of Object.values(RESEARCH_PLAN_CHECK_STATE_LABELS)) {
      expect(label).not.toMatch(/review|checking|in progress/i)
    }
  })

  it('reads a draft written before the id migration', () => {
    expect(researchPlanCheckStateOf('該当')).toBe('applies')
    expect(researchPlanCheckStateOf('要確認')).toBe('needs-check')
    expect(researchPlanCheckStateOf('非該当')).toBe('not-applies')
    expect(researchPlanCheckStateOf('未定')).toBe('unset')
    expect(researchPlanCheckStateOf('applies')).toBe('applies')
    expect(researchPlanCheckStateOf('nonsense')).toBe('unset')
    expect(researchPlanCheckStateOf(42)).toBe('unset')

    const legacy = normalizeResearchPlanChecklistDraft({
      checks: {
        'design:retro-cohort': '該当',
        'design:case-control': '未定',
        'pitfalls:period': '要確認'
      }
    })
    expect(legacy.checks).toEqual({
      'design:retro-cohort': 'applies',
      'pitfalls:period': 'needs-check'
    })
  })

  it('never states a prohibited approval, novelty, or acceptance claim', () => {
    const copy = [
      ...S34_RESEARCH_PLAN_CHECKLIST.flatMap((candidate) => [
        candidate.title,
        candidate.question,
        ...candidate.items.map((item) => item.label)
      ]),
      S34_2_RESEARCH_DESIGN_CHECKLIST
    ]
    for (const text of copy) expect(hasProhibitedApprovalClaim(text), text).toBe(false)
  })

  it('normalizes an untrusted draft to known items, states, and memos', () => {
    const draft = normalizeResearchPlanChecklistDraft({
      checks: {
        'design:retro-cohort': 'applies',
        'pitfalls:period': 'unset',
        'unknown:item': 'applies',
        'design:case-control': 'not-a-state'
      },
      memos: {
        design: '  期間は 2019–2024 で確認する  ',
        unknown: 'drop me',
        pitfalls: '   '
      }
    })
    expect(draft.checks).toEqual({ 'design:retro-cohort': 'applies' })
    expect(draft.memos).toEqual({ design: '期間は 2019–2024 で確認する' })
    expect(normalizeResearchPlanChecklistDraft(null)).toEqual(emptyResearchPlanChecklistDraft())
    expect(normalizeResearchPlanChecklistDraft('nope')).toEqual(emptyResearchPlanChecklistDraft())
  })

  it('truncates an over-long memo to the stored limit', () => {
    const overLong = 'あ'.repeat(600)
    const draft = normalizeResearchPlanChecklistDraft({ memos: { design: overLong } })
    expect(draft.memos.design).toHaveLength(500)
    expect(draft.memos.design).toBe(overLong.slice(0, 500))
  })

  it('exposes every seed item id exactly once', () => {
    const ids = researchPlanChecklistItemIds()
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(6 + 13 + 5 + 5)
  })
})
