import { describe, expect, it } from 'vitest'

import {
  assessConditionalR8Items,
  assessR8Applicability,
  validateNotApplicable
} from './applicability'
import {
  evaluateCompleteness,
  evaluateR8ItemCompleteness,
  formatNotApplicableText,
  hasMeaningfulTemplateContent,
  R8_COMPLETENESS_RULES
} from './completeness'
import { R8_ITEMS } from './r8-items'

describe('R8 protocol item catalog', () => {
  it('contains fifteen required and ten conditional items in order', () => {
    expect(R8_ITEMS.map(({ number }) => number)).toEqual(
      Array.from({ length: 25 }, (_, i) => i + 1)
    )
    expect(R8_ITEMS.filter(({ required }) => required)).toHaveLength(15)
  })
  it('keeps item 5 as participant selection and item 6 as scientific rationale', () => {
    expect(R8_ITEMS[4]).toMatchObject({ number: 5, title: 'Participant selection policy' })
    expect(R8_ITEMS[5]).toMatchObject({ number: 6, title: 'Scientific rationale' })
  })
})

describe('R8 applicability', () => {
  it('fails closed for every unconfirmed conditional answer', () => {
    const results = assessR8Applicability({ 16: { value: 'yes', quote: '代諾者から同意を得る' } })
    expect(results.slice(0, 15).every(({ applicability }) => applicability === 'required')).toBe(
      true
    )
    expect(results.slice(15).every(({ applicability }) => applicability === 'needs-review')).toBe(
      true
    )
  })

  it('keeps verbatim evidence for a confirmed decision', () => {
    const result = assessR8Applicability({
      23: {
        value: 'yes',
        quote: '解析業務を外部事業者に委託する。',
        confirmedBy: 'researcher-1',
        confirmedAt: '2026-10-17T00:00:00.000Z'
      }
    }).find(({ item }) => item === 23)
    expect(result).toMatchObject({
      applicability: 'required',
      evidence: '解析業務を外部事業者に委託する。'
    })
  })

  it('requires a reason and rejects not-applicable on required items', () => {
    const [required] = assessR8Applicability({})
    const conditional = assessR8Applicability({}).find(({ item }) => item === 18)!
    expect(validateNotApplicable(required, '対象外')).toEqual({
      valid: false,
      error: 'required-item'
    })
    expect(validateNotApplicable(conditional, '  ')).toEqual({
      valid: false,
      error: 'reason-required'
    })
    expect(validateNotApplicable(conditional, '緊急状況下の研究ではないため')).toEqual({
      valid: true
    })
  })

  it.each(['minor-invasion', '軽微な侵襲'] as const)(
    'treats the original invasion value %s as requiring items 20 and 21',
    (value) => {
      const confirmed = {
        value,
        quote: '軽微な侵襲として研究目的で少量の採血を行う。',
        confirmedBy: 'researcher-1',
        confirmedAt: '2026-10-17T10:00:00+09:00'
      }
      const results = assessConditionalR8Items({ nodes: { Q1a_侵襲: confirmed }, checklist: {} })
      expect(results.filter(({ item }) => item === 20 || item === 21)).toEqual([
        expect.objectContaining({ item: 20, applicability: 'required' }),
        expect.objectContaining({ item: 21, applicability: 'required' })
      ])
    }
  )

  it('keeps every unanswered explicit checklist item pending', () => {
    const results = assessConditionalR8Items({ nodes: {}, checklist: {} })
    for (const number of [18, 19, 22, 23, 24]) {
      expect(results.find(({ item }) => item === number)?.applicability).toBe('needs-review')
    }
  })

  it('does not allow an unconfirmed node answer to determine applicability', () => {
    const results = assessConditionalR8Items({
      nodes: { Q1b_介入: { value: 'yes', quote: '割付を行う。' } },
      checklist: {}
    })
    expect(results.find(({ item }) => item === 25)?.applicability).toBe('needs-review')
  })
})

describe('template completeness', () => {
  it.each(['{{研究目的}}', '【要記入】', '〇〇', '＿＿＿＿', '□', '※ 記入例を削除してください'])(
    'treats %s as blank',
    (value) => {
      expect(hasMeaningfulTemplateContent(value)).toBe(false)
    }
  )

  it('normalizes full-width placeholders', () => {
    expect(hasMeaningfulTemplateContent('＿＿＿')).toBe(false)
  })

  it('detects partially completed compound items without judging quality', () => {
    expect(evaluateCompleteness('観察研究の方法を記載する。', R8_COMPLETENESS_RULES[4])).toBe(
      '部分空缺'
    )
    expect(
      evaluateCompleteness(
        '研究方法：後ろ向き観察。\n研究期間：2026年から2027年。',
        R8_COMPLETENESS_RULES[4]
      )
    ).toBe('記載あり')
  })

  it('treats item 6 cohort coverage with a reason as recorded without judging validity', () => {
    expect(
      evaluateR8ItemCompleteness(
        6,
        '期間内の該当全例を対象とする。理由：選択バイアスを避けるため。'
      )
    ).toBe('記載あり')
  })

  it('requires a reason when item 21 says there is no compensation', () => {
    expect(evaluateR8ItemCompleteness(21, '補償なし')).toBe('部分空缺')
    expect(evaluateR8ItemCompleteness(21, '補償なし。理由：通常診療を超える負担がないため')).toBe(
      '記載あり'
    )
  })

  it.each(Array.from({ length: 10 }, (_, index) => index + 16))(
    'requires the structured not-applicable reason for item %s',
    (item) => {
      expect(evaluateR8ItemCompleteness(item, '該当なし')).toBe('部分空缺')
      expect(evaluateR8ItemCompleteness(item, '本院では不要')).toBe('部分空缺')
      expect(evaluateR8ItemCompleteness(item, formatNotApplicableText(item, '対象外のため'))).toBe(
        '記載あり'
      )
    }
  )
})
