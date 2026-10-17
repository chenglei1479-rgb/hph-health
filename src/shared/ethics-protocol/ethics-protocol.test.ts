import { describe, expect, it } from 'vitest'

import { assessR8Applicability, validateNotApplicable } from './applicability'
import {
  evaluateCompleteness,
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
})
