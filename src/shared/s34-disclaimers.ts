// §34.2 static disclaimers.
//
// These are fixed Japanese strings shown verbatim on the review surfaces that T2/T4
// wire into the UI. T1 only defines the constants — no UI mounting, no telemetry, no
// egress — together with the banned-claim tests that protect the same flows. The text
// is local copy and is never uploaded.
//
// Each string is deliberately a negation/limitation, so the approval-claim guard in
// `src/shared/ethics-protocol/approval-claims.ts` must not flag any of them.

/** §34.2 ① — research-design / selection-exclusion / endpoint / confounding checklist. */
export const S34_2_RESEARCH_DESIGN_CHECKLIST =
  '本機能は、研究デザイン・選択除外・エンドポイント・交絡／欠損について、よく確認される観点のチェックリストを提示する補助です。高インパクト誌への適合や採択可能性を判断・保証するものではありません。最終判断は先生と指導医が行ってください。'

/** §34.2 ② — protocol / explanatory-document drafting. */
export const S34_2_PROTOCOL_DRAFTING =
  '本機能は、protocol・説明文書等の草稿作成を補助します。倫理審査委員会への申請内容・結果について当社は責任を負わず、所属機関の規程および委員会の判断に従ってください。種子テスト期間中は架空データのみとし、実データでの利用は機関承認パイロット以降とします。'

/** §34.2 ③ — literature / guideline-based points to consider. */
export const S34_2_LITERATURE_POINTS =
  '提示する論点・確認項目は、文献やガイドラインの出典に基づく検討のきっかけです。新規性・臨床的価値・データ入手可能性について結論を出すものではありません。採否は指導医と先生が判断してください。ガイドラインや論文の本文は製品内に転載せず、出典リンクと名称のみを示します。'
