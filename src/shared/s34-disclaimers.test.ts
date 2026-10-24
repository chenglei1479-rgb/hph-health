import { describe, expect, it } from 'vitest'

import { hasProhibitedApprovalClaim } from './ethics-protocol/approval-claims'
import {
  S34_2_LITERATURE_POINTS,
  S34_2_PROTOCOL_DRAFTING,
  S34_2_RESEARCH_DESIGN_CHECKLIST
} from './s34-disclaimers'

describe('s34.2 disclaimers', () => {
  it('keeps the three Japanese strings exactly as specced', () => {
    expect(S34_2_RESEARCH_DESIGN_CHECKLIST).toBe(
      '本機能は、研究デザイン・選択除外・エンドポイント・交絡／欠損について、よく確認される観点のチェックリストを提示する補助です。高インパクト誌への適合や採択可能性を判断・保証するものではありません。最終判断は先生と指導医が行ってください。'
    )
    expect(S34_2_PROTOCOL_DRAFTING).toBe(
      '本機能は、protocol・説明文書等の草稿作成を補助します。倫理審査委員会への申請内容・結果について当社は責任を負わず、所属機関の規程および委員会の判断に従ってください。種子テスト期間中は架空データのみとし、実データでの利用は機関承認パイロット以降とします。'
    )
    expect(S34_2_LITERATURE_POINTS).toBe(
      '提示する論点・確認項目は、文献やガイドラインの出典に基づく検討のきっかけです。新規性・臨床的価値・データ入手可能性について結論を出すものではありません。採否は指導医と先生が判断してください。ガイドラインや論文の本文は製品内に転載せず、出典リンクと名称のみを示します。'
    )
  })

  it('does not trip the prohibited-approval-claim guard', () => {
    for (const text of [
      S34_2_RESEARCH_DESIGN_CHECKLIST,
      S34_2_PROTOCOL_DRAFTING,
      S34_2_LITERATURE_POINTS
    ]) {
      expect(hasProhibitedApprovalClaim(text)).toBe(false)
    }
  })
})
