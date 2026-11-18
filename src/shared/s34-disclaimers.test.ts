import { describe, expect, it } from 'vitest'

import { hasProhibitedApprovalClaim } from './ethics-protocol/approval-claims'
import {
  S34_2_LITERATURE_POINTS,
  S34_2_PROTOCOL_DRAFTING,
  S34_2_RESEARCH_DESIGN_CHECKLIST
} from './s34-disclaimers'

const copy = [
  S34_2_RESEARCH_DESIGN_CHECKLIST,
  S34_2_PROTOCOL_DRAFTING,
  S34_2_LITERATURE_POINTS
]

describe('s34.2 disclaimers', () => {
  // #261: the disclaimers are translated now, so these constants are the English i18n keys. A Japanese
  // character here would become an unmatchable key and the reader would see the key itself.
  it('keeps three English source keys without Japanese script', () => {
    for (const text of copy) {
      expect(text.length).toBeGreaterThan(0)
      expect(text).not.toMatch(/[\p{Script=Hiragana}\p{Script=Katakana}]/u)
    }
    expect(S34_2_RESEARCH_DESIGN_CHECKLIST).toContain('commonly checked')
    expect(S34_2_PROTOCOL_DRAFTING).toContain('ethics review board')
    expect(S34_2_LITERATURE_POINTS).toContain('prompts for consideration')
  })

  // The medical review requires the negation to survive translation, and this is the source every
  // translation is checked against.
  it('keeps the negation structure the approval-claim guard depends on', () => {
    expect(S34_2_RESEARCH_DESIGN_CHECKLIST).toContain('It does not judge or guarantee')
    expect(S34_2_PROTOCOL_DRAFTING).toContain('We are not responsible')
    expect(S34_2_LITERATURE_POINTS).toContain('They do not conclude anything')
    expect(S34_2_PROTOCOL_DRAFTING).toContain('fictional data only')
  })

  it('does not trip the prohibited-approval-claim guard', () => {
    for (const text of copy) {
      expect(hasProhibitedApprovalClaim(text)).toBe(false)
    }
  })
})
