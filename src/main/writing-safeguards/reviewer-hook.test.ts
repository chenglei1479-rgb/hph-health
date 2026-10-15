import { describe, expect, it } from 'vitest'

import { MAX_REVIEW_CHECKS } from '../reviewer/submission-limits'
import type { NewCheck } from '../../shared/reviewer'
import { CONCLUSION_CHECK_ENV } from '../../shared/writing-safeguards/conclusion-check'
import { appendConclusionFlags, isConclusionFlagCheck } from './reviewer-hook'

const blocks = [
  {
    kind: 'message',
    payload: {
      content:
        '結論\n喫煙が肺癌を引き起こした。治療は死亡率を有意に低下させた。この結果はすべての患者に一般化できる。'
    }
  },
  {
    kind: 'activity',
    payload: {
      terminalOutput:
        '喫煙と肺癌の間に相関がみられた。両群の差は有意ではなかった（p=0.42）。\n限界\n対象は単一施設の成人肺癌患者であり、結果を一般化できない。因果関係は示せない。'
    }
  }
]

const passCheck = (index: number): NewCheck => ({
  status: 'pass',
  claim: `existing ${index}`,
  evidence: 'traced'
})

describe('reviewer conclusion hook', () => {
  it('adds warn flags and does not rewrite the reviewer claims', () => {
    const original = [passCheck(0)]
    const next = appendConclusionFlags(original, blocks, {})
    expect(original).toEqual([passCheck(0)])
    expect(next[0]).toEqual(passCheck(0))
    const flags = next.filter(isConclusionFlagCheck)
    expect(flags.map((flag) => flag.status)).toEqual(['warn', 'warn', 'warn'])
    expect(flags.map((flag) => flag.evidence)).toEqual([
      expect.stringContaining('conclusion-check:correlation-as-causation'),
      expect.stringContaining('conclusion-check:effect-without-significance'),
      expect.stringContaining('conclusion-check:extrapolation-beyond-population')
    ])
    expect(flags.every((flag) => flag.evidence.includes('書き換えていません'))).toBe(true)
    expect(next.some((check) => check.claim.includes('書き換えた'))).toBe(false)
  })

  it('adds nothing when the feature flag is off', () => {
    const next = appendConclusionFlags([passCheck(0)], blocks, { [CONCLUSION_CHECK_ENV]: '0' })
    expect(next).toEqual([passCheck(0)])
  })

  it('does not exceed the reviewer check limit', () => {
    const full = Array.from({ length: MAX_REVIEW_CHECKS }, (_, index) => passCheck(index))
    expect(appendConclusionFlags(full, blocks, {})).toEqual(full)
  })

  it('ignores a conclusion that has no notebook evidence', () => {
    const next = appendConclusionFlags(
      [],
      [{ kind: 'message', payload: { content: '結論\n喫煙が肺癌を引き起こした。' } }],
      {}
    )
    expect(next).toEqual([])
  })
})
