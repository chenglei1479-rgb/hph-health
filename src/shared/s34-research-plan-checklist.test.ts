import { describe, expect, it } from 'vitest'

import { hasProhibitedApprovalClaim } from './ethics-protocol/approval-claims'
import {
  S34_2_RESEARCH_DESIGN_CHECKLIST,
  S34_2_PROTOCOL_DRAFTING,
  S34_2_LITERATURE_POINTS
} from './s34-disclaimers'
import {
  DEFAULT_RESEARCH_PLAN_CHECK_STATE,
  RESEARCH_PLAN_CHECK_STATES,
  S34_PITFALLS_INITIAL_VISIBLE,
  S34_PITFALLS_TITLE,
  S34_RESEARCH_PLAN_CHECKLIST,
  emptyResearchPlanChecklistDraft,
  normalizeResearchPlanChecklistDraft,
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
    expect(pitfalls.title).toBe('よく落ちる点のチェックリスト')
    expect(S34_PITFALLS_TITLE).toBe(pitfalls.title)
    expect(S34_PITFALLS_INITIAL_VISIBLE).toBe(12)
    // 13 seeds: the first screen shows 12 and 「もっと見る」 reveals the last one.
    expect(pitfalls.items).toHaveLength(13)
    expect(pitfalls.items.length - S34_PITFALLS_INITIAL_VISIBLE).toBe(1)
  })

  it('quotes the seed items verbatim', () => {
    expect(block('design').items.map((item) => item.label)).toEqual([
      '後ろ向きコホート（既存データの追跡）',
      '症例対照',
      '横断研究',
      '前向き観察',
      '単一群の前後比較',
      '表の列だけではデザイン判断が難しい（要確認）'
    ])
    expect(block('design').question).toBe(
      'この研究に近いデザインはどれですか？／表から見て不向きな点は？'
    )
    expect(block('endpoints').items).toHaveLength(5)
    expect(block('confounding').items).toHaveLength(5)
    expect(block('endpoints').items[0]?.label).toBe('主エンドポイントが一つに絞れていない')
    expect(block('confounding').items[3]?.label).toBe('除外による選択バイアスの論点が抜けている')
  })

  it('offers the four check states with 未定 as the default', () => {
    expect(RESEARCH_PLAN_CHECK_STATES).toEqual(['要確認', '該当', '非該当', '未定'])
    expect(DEFAULT_RESEARCH_PLAN_CHECK_STATE).toBe('未定')
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
    // T4/T5 constants stay untouched by this ticket.
    expect(S34_2_PROTOCOL_DRAFTING).toContain('protocol')
    expect(S34_2_LITERATURE_POINTS).toContain('文献')
  })

  it('normalizes an untrusted draft to known items, states, and memos', () => {
    const draft = normalizeResearchPlanChecklistDraft({
      checks: {
        'design:retro-cohort': '該当',
        'pitfalls:period': '未定',
        'unknown:item': '該当',
        'design:case-control': 'not-a-state'
      },
      memos: {
        design: '  期間は 2019–2024 で確認する  ',
        unknown: 'drop me',
        pitfalls: '   '
      }
    })
    expect(draft.checks).toEqual({ 'design:retro-cohort': '該当' })
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
