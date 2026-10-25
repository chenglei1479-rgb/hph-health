// §34 T3 — research-plan four-question checklist seed copy.
//
// The four blocks and their items are founder-supplied Japanese seed copy, shown verbatim on the
// mentor-prep (① 指導医と相談する準備) surface. Every string is a question or a known gap, never a
// conclusion, so the approval-claim guard in `ethics-protocol/approval-claims.ts` must not flag
// them. The UI chrome around them is translated; this seed copy is not.

/** Check state for one seed item. `未定` is the default for every item. */
export type ResearchPlanCheckState = '要確認' | '該当' | '非該当' | '未定'

export const RESEARCH_PLAN_CHECK_STATES: readonly ResearchPlanCheckState[] = [
  '要確認',
  '該当',
  '非該当',
  '未定'
]

export const DEFAULT_RESEARCH_PLAN_CHECK_STATE: ResearchPlanCheckState = '未定'

export const isResearchPlanCheckState = (value: unknown): value is ResearchPlanCheckState =>
  typeof value === 'string' && (RESEARCH_PLAN_CHECK_STATES as readonly string[]).includes(value)

export type ResearchPlanChecklistBlockId = 'design' | 'pitfalls' | 'endpoints' | 'confounding'

export type ResearchPlanChecklistItem = {
  id: string
  label: string
}

export type ResearchPlanChecklistBlock = {
  id: ResearchPlanChecklistBlockId
  /** Fixed Japanese block heading. ② keeps the founder-locked title. */
  title: string
  /** One guiding question per block. */
  question: string
  items: readonly ResearchPlanChecklistItem[]
}

export const S34_PITFALLS_TITLE = 'よく落ちる点のチェックリスト'

/** Panel heading for the four-question checklist. Fixed Japanese, like the seed copy. */
export const S34_RESEARCH_PLAN_PANEL_HEADING = '研究計画の四つの確認'

/** Items of ② shown before 「もっと見る」. The block has 13 seeds, so one stays collapsed. */
export const S34_PITFALLS_INITIAL_VISIBLE = 12

export const S34_RESEARCH_PLAN_CHECKLIST: readonly ResearchPlanChecklistBlock[] = [
  {
    id: 'design',
    title: '① デザインの種類',
    question: 'この研究に近いデザインはどれですか？／表から見て不向きな点は？',
    items: [
      { id: 'design:retro-cohort', label: '後ろ向きコホート（既存データの追跡）' },
      { id: 'design:case-control', label: '症例対照' },
      { id: 'design:cross-sectional', label: '横断研究' },
      { id: 'design:prospective', label: '前向き観察' },
      { id: 'design:pre-post', label: '単一群の前後比較' },
      { id: 'design:columns-insufficient', label: '表の列だけではデザイン判断が難しい（要確認）' }
    ]
  },
  {
    id: 'pitfalls',
    title: S34_PITFALLS_TITLE,
    question: 'この計画で、よく落ちる点に当てはまるものはありますか？',
    items: [
      { id: 'pitfalls:period', label: '対象期間の開始・終了が明記されていない' },
      { id: 'pitfalls:selection', label: '選択基準が曖昧' },
      { id: 'pitfalls:unmeasurable', label: '測定不能' },
      { id: 'pitfalls:exclusion', label: '除外基準が欠けている' },
      { id: 'pitfalls:population-source', label: '対象集団とデータソースの対応が不明' },
      {
        id: 'pitfalls:missing-primary',
        label: '欠損が多い変数を主解析に置いていないか未確認'
      },
      {
        id: 'pitfalls:sample-size',
        label: 'サンプルサイズ根拠が未記載（全例でも「悉皆である」旨が無い）'
      },
      { id: 'pitfalls:confounder-list', label: '交絡候補の一覧が無い' },
      { id: 'pitfalls:endpoint-operational', label: 'エンドポイント定義が操作可能でない' },
      { id: 'pitfalls:stopping', label: '追跡／観察の打ち切り理由が未整理' },
      { id: 'pitfalls:multiplicity', label: '多重比較・探索的解析の扱いが未記載' },
      {
        id: 'pitfalls:ethics-section',
        label: '倫理・個人情報の手続き欄が空のまま相談に出そうとしている'
      },
      { id: 'pitfalls:unshared-assumption', label: '指導医と未共有の仮定がメモに残っている' }
    ]
  },
  {
    id: 'endpoints',
    title: '③ 暴露／主・副エンドポイント',
    question: '主エンドポイントと暴露の定義は、測定手順まで落ちていますか？',
    items: [
      { id: 'endpoints:single-primary', label: '主エンドポイントが一つに絞れていない' },
      { id: 'endpoints:too-many-secondary', label: '副次エンドポイントが過多／未優先' },
      {
        id: 'endpoints:exposure-definition',
        label: '暴露（介入・要因）の定義が測定手順まで落ちていない'
      },
      { id: 'endpoints:timepoints', label: '時点（ベースライン／フォロー）が揃っていない' },
      { id: 'endpoints:composite', label: '複合エンドポイントの構成が未合意' }
    ]
  },
  {
    id: 'confounding',
    title: '④ 交絡と欠測',
    question: '交絡と欠測について、指導医に説明できる材料はありますか？',
    items: [
      {
        id: 'confounding:candidate-list',
        label: '交絡因子の候補リストが指導医用に書けていない'
      },
      {
        id: 'confounding:missing-mechanism',
        label: '欠損メカニズム（MCAR/MAR 等）を議論する材料が無い'
      },
      { id: 'confounding:sensitivity', label: '感度分析の要否が未記載' },
      {
        id: 'confounding:selection-bias',
        label: '除外による選択バイアスの論点が抜けている'
      },
      { id: 'confounding:measurement-error', label: '測定誤差・誤分類の可能性が未言及' }
    ]
  }
]

/**
 * One project's local draft. Keyed by the current project, so switching projects never mixes
 * answers. Per block there is at most one memo line; per item one of the four states.
 */
export type ResearchPlanChecklistDraft = {
  checks: Record<string, ResearchPlanCheckState>
  memos: Partial<Record<ResearchPlanChecklistBlockId, string>>
}

export const emptyResearchPlanChecklistDraft = (): ResearchPlanChecklistDraft => ({
  checks: {},
  memos: {}
})

export const researchPlanChecklistItemIds = (): string[] =>
  S34_RESEARCH_PLAN_CHECKLIST.flatMap((block) => block.items.map((item) => item.id))

const RESEARCH_PLAN_BLOCK_IDS: readonly string[] = S34_RESEARCH_PLAN_CHECKLIST.map(
  (block) => block.id
)

const MEMO_LIMIT = 500

/**
 * Settings files are untrusted input. Keep only known item ids with known states, and only known
 * block ids with a trimmed, length-capped memo; anything else is dropped instead of repaired.
 */
export const normalizeResearchPlanChecklistDraft = (value: unknown): ResearchPlanChecklistDraft => {
  const draft = emptyResearchPlanChecklistDraft()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return draft
  const record = value as { checks?: unknown; memos?: unknown }
  const knownItems = new Set(researchPlanChecklistItemIds())
  if (record.checks && typeof record.checks === 'object' && !Array.isArray(record.checks)) {
    for (const [id, state] of Object.entries(record.checks as Record<string, unknown>)) {
      if (!knownItems.has(id) || !isResearchPlanCheckState(state)) continue
      if (state === DEFAULT_RESEARCH_PLAN_CHECK_STATE) continue
      draft.checks[id] = state
    }
  }
  if (record.memos && typeof record.memos === 'object' && !Array.isArray(record.memos)) {
    for (const [id, memo] of Object.entries(record.memos as Record<string, unknown>)) {
      if (!RESEARCH_PLAN_BLOCK_IDS.includes(id) || typeof memo !== 'string') continue
      const trimmed = memo.trim().slice(0, MEMO_LIMIT)
      if (trimmed.length === 0) continue
      draft.memos[id as ResearchPlanChecklistBlockId] = trimmed
    }
  }
  return draft
}
