import { describe, expect, it } from 'vitest'

import {
  CONCLUSION_CHECK_ENV,
  conclusionCheckEnabled,
  flagConclusions,
  type NotebookEvidence
} from './conclusion-check'

const notebook = (results: string, limitations = ''): NotebookEvidence => ({
  results,
  limitations
})

describe('conclusion check', () => {
  it('is on by default and turns off with DRA_CONCLUSION_CHECK', () => {
    expect(conclusionCheckEnabled({})).toBe(true)
    expect(conclusionCheckEnabled({ [CONCLUSION_CHECK_ENV]: '' })).toBe(true)
    for (const value of ['0', 'false', 'off', 'no', 'disabled', 'OFF']) {
      expect(conclusionCheckEnabled({ [CONCLUSION_CHECK_ENV]: value })).toBe(false)
    }
  })

  it('flags correlation stated as causation and does not rewrite the sentence', () => {
    const sentence = '喫煙が肺癌を引き起こした。'
    const result = flagConclusions({
      conclusions: sentence,
      notebook: notebook('喫煙と肺癌の間に相関がみられた。', '因果関係は示せない。')
    })
    expect(result.rewritten).toBe(false)
    expect(result.flags.map((flag) => flag.kind)).toEqual(['correlation-as-causation'])
    expect(result.flags[0]?.sentence).toBe(sentence)
    expect(result.flags[0]?.evidence).toContain('書き換えていません')
  })

  it('does not flag an association that stays an association', () => {
    const result = flagConclusions({
      conclusions: '喫煙は肺癌と関連していた。',
      notebook: notebook('喫煙と肺癌の間に相関がみられた。', '因果関係は示せない。')
    })
    expect(result.flags).toEqual([])
  })

  it('flags a claimed effect when the notebook is not significant', () => {
    const result = flagConclusions({
      conclusions: '治療は死亡率を有意に低下させた。',
      notebook: notebook('両群の差は有意ではなかった（p=0.42）。')
    })
    expect(result.flags.map((flag) => flag.kind)).toEqual(['effect-without-significance'])
    expect(result.rewritten).toBe(false)
  })

  it('does not flag an effect the notebook marks significant', () => {
    const result = flagConclusions({
      conclusions: '治療は死亡率を有意に低下させた。',
      notebook: notebook('死亡率は有意に低下した（p=0.01）。')
    })
    expect(result.flags).toEqual([])
  })

  it('flags a directional effect when every p value is at least 0.05', () => {
    const result = flagConclusions({
      conclusions: 'HbA1cは低下した。',
      notebook: notebook('群間差の p=0.20')
    })
    expect(result.flags.map((flag) => flag.kind)).toEqual(['effect-without-significance'])
  })

  it('flags extrapolation beyond the stated population', () => {
    const result = flagConclusions({
      conclusions: 'この結果はすべての患者に一般化できる。',
      notebook: notebook('対象は単一施設の成人肺癌患者である。', '結果を一般化できない。')
    })
    expect(result.flags.map((flag) => flag.kind)).toContain('extrapolation-beyond-population')
    expect(result.rewritten).toBe(false)
  })

  it('does not flag a conclusion that stays inside the study population', () => {
    const result = flagConclusions({
      conclusions: '成人肺癌患者では関連がみられた。',
      notebook: notebook('対象は単一施設の成人肺癌患者である。', '結果を一般化できない。')
    })
    expect(result.flags.some((flag) => flag.kind === 'extrapolation-beyond-population')).toBe(false)
  })

  it('flags a child population that the adult cohort does not support', () => {
    const result = flagConclusions({
      conclusions: 'この治療は小児にも同様に有効である。',
      notebook: notebook('対象は成人である。', '小児へは外挿できない。')
    })
    expect(result.flags.map((flag) => flag.kind)).toContain('extrapolation-beyond-population')
  })

  it('returns no flags when disabled or when no notebook evidence exists', () => {
    const conclusions = '喫煙が肺癌を引き起こした。'
    expect(
      flagConclusions({
        conclusions,
        notebook: notebook('相関がみられた。'),
        enabled: false
      }).flags
    ).toEqual([])
    expect(flagConclusions({ conclusions, notebook: notebook('', '') }).flags).toEqual([])
  })
})
