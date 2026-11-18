// §34 T3 — research-plan four-question checklist seed copy.
//
// The four blocks and their items used to be founder-supplied Japanese shown verbatim on the
// mentor-prep (① 指導医と相談する準備) surface. #261: the copy is user-visible prose, so it is
// translated like the chrome around it. The English source strings below are the i18n keys (AGENTS.md:
// keys are the English source text, not semantic paths); the ids stay stable for storage.
//
// Every string is a question or a known gap, never a conclusion, so the approval-claim guard in
// `ethics-protocol/approval-claims.ts` must not flag them.

/** Check state for one seed item. `unset` is the default for every item. */
export type ResearchPlanCheckState = 'needs-check' | 'applies' | 'not-applies' | 'unset'

export const RESEARCH_PLAN_CHECK_STATES: readonly ResearchPlanCheckState[] = [
  'needs-check',
  'applies',
  'not-applies',
  'unset'
]

export const DEFAULT_RESEARCH_PLAN_CHECK_STATE: ResearchPlanCheckState = 'unset'

/** English source (i18n key) for each state label. */
export const RESEARCH_PLAN_CHECK_STATE_LABELS: Readonly<Record<ResearchPlanCheckState, string>> = {
  'needs-check': 'Needs check',
  applies: 'Applies',
  'not-applies': 'Does not apply',
  unset: 'Not set'
}

// #261: the four states were stored as these Japanese strings before the id migration. Drafts written
// by an earlier build must keep their ticks, so `normalizeResearchPlanChecklistDraft` still reads them;
// every other value (empty string, junk, a state from a newer build) falls back to `unset` and never
// throws.
const LEGACY_CHECK_STATES: Readonly<Record<string, ResearchPlanCheckState>> = {
  要確認: 'needs-check',
  該当: 'applies',
  非該当: 'not-applies',
  未定: 'unset'
}

export const isResearchPlanCheckState = (value: unknown): value is ResearchPlanCheckState =>
  typeof value === 'string' && (RESEARCH_PLAN_CHECK_STATES as readonly string[]).includes(value)

/** Reads a stored state: current id, legacy Japanese, or `unset` for anything else. */
export const researchPlanCheckStateOf = (value: unknown): ResearchPlanCheckState => {
  if (isResearchPlanCheckState(value)) return value
  return typeof value === 'string' ? (LEGACY_CHECK_STATES[value] ?? 'unset') : 'unset'
}

export type ResearchPlanChecklistBlockId = 'design' | 'pitfalls' | 'endpoints' | 'confounding'

export type ResearchPlanChecklistItem = {
  id: string
  /** English source text, used directly as the i18n key. */
  label: string
}

export type ResearchPlanChecklistBlock = {
  id: ResearchPlanChecklistBlockId
  /** English source heading (i18n key). */
  title: string
  /** One guiding question per block (English source, i18n key). */
  question: string
  items: readonly ResearchPlanChecklistItem[]
}

export const S34_PITFALLS_TITLE = 'Common pitfalls checklist'

/** Panel heading for the four-question checklist (English source, i18n key). */
export const S34_RESEARCH_PLAN_PANEL_HEADING = 'Four checks for the research plan'

/** Items of ② shown before 「Show more」. The block has 13 seeds, so one stays collapsed. */
export const S34_PITFALLS_INITIAL_VISIBLE = 12

export const S34_RESEARCH_PLAN_CHECKLIST: readonly ResearchPlanChecklistBlock[] = [
  {
    id: 'design',
    title: '① Study design type',
    question:
      'Which design is closest to this study? / Looking at the variable definition table, where does it fall short?',
    items: [
      { id: 'design:retro-cohort', label: 'Retrospective cohort (follow-up of existing data)' },
      { id: 'design:case-control', label: 'Case-control' },
      { id: 'design:cross-sectional', label: 'Cross-sectional study' },
      { id: 'design:prospective', label: 'Prospective observation' },
      { id: 'design:pre-post', label: 'Single-group before-and-after comparison' },
      {
        id: 'design:columns-insufficient',
        label: 'The table columns alone are not enough to judge the design (Needs check)'
      }
    ]
  },
  {
    id: 'pitfalls',
    title: S34_PITFALLS_TITLE,
    question: 'Does this plan hit any of the common pitfalls?',
    items: [
      {
        id: 'pitfalls:period',
        label: 'The start and end of the observation period are not stated'
      },
      { id: 'pitfalls:selection', label: 'The selection criteria are vague' },
      { id: 'pitfalls:unmeasurable', label: 'The measure cannot be measured' },
      { id: 'pitfalls:exclusion', label: 'Exclusion criteria are missing' },
      {
        id: 'pitfalls:population-source',
        label: 'How the population maps to the data source is unclear'
      },
      {
        id: 'pitfalls:missing-primary',
        label:
          'Not yet checked whether a variable with many missing values sits in the primary analysis'
      },
      {
        id: 'pitfalls:sample-size',
        label:
          'No sample-size rationale (no statement that every case was included either)'
      },
      { id: 'pitfalls:confounder-list', label: 'There is no list of candidate confounders' },
      {
        id: 'pitfalls:endpoint-operational',
        label: 'The endpoint definition is not operational'
      },
      {
        id: 'pitfalls:stopping',
        label: 'The reasons for stopping follow-up are not sorted out'
      },
      {
        id: 'pitfalls:multiplicity',
        label: 'How multiple comparisons and exploratory analyses are handled is not stated'
      },
      {
        id: 'pitfalls:ethics-section',
        label:
          'The ethics and personal-information section is still empty while the plan is heading into consultation with the supervising physician'
      },
      {
        id: 'pitfalls:unshared-assumption',
        label: 'Assumptions not yet shared with the supervising physician are left in the memo'
      }
    ]
  },
  {
    id: 'endpoints',
    title: '③ Exposure, primary and secondary endpoints',
    question:
      'Are the primary endpoint and the exposure defined down to the measurement procedure?',
    items: [
      { id: 'endpoints:single-primary', label: 'The primary endpoint is not narrowed down to one' },
      {
        id: 'endpoints:too-many-secondary',
        label: 'There are too many secondary endpoints / no priority among them'
      },
      {
        id: 'endpoints:exposure-definition',
        label:
          'The definition of the exposure (intervention or factor) does not reach the measurement procedure'
      },
      {
        id: 'endpoints:timepoints',
        label: 'The time points (baseline / follow-up) are not aligned'
      },
      { id: 'endpoints:composite', label: 'The components of the composite endpoint are not settled' }
    ]
  },
  {
    id: 'confounding',
    title: '④ Confounding and missing data',
    question: 'Can you explain confounding and missing data to your supervising physician with what you have?',
    items: [
      {
        id: 'confounding:candidate-list',
        label: 'The candidate confounder list is not written for the supervising physician'
      },
      {
        id: 'confounding:missing-mechanism',
        label: 'There is no material to discuss the missing-data mechanism (MCAR/MAR etc.)'
      },
      {
        id: 'confounding:sensitivity',
        label: 'Whether a sensitivity analysis is needed is not stated'
      },
      {
        id: 'confounding:selection-bias',
        label: 'The selection-bias argument from exclusions is missing'
      },
      {
        id: 'confounding:measurement-error',
        label: 'Measurement error and misclassification are not mentioned'
      }
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
 *
 * #261: states are stored as stable ids now. A draft written before the migration carries the Japanese
 * labels, so those are read through `researchPlanCheckStateOf`; writes always use the ids (the panel
 * never writes a legacy value), and an unknown value becomes `unset` instead of throwing.
 */
export const normalizeResearchPlanChecklistDraft = (value: unknown): ResearchPlanChecklistDraft => {
  const draft = emptyResearchPlanChecklistDraft()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return draft
  const record = value as { checks?: unknown; memos?: unknown }
  const knownItems = new Set(researchPlanChecklistItemIds())
  if (record.checks && typeof record.checks === 'object' && !Array.isArray(record.checks)) {
    for (const [id, state] of Object.entries(record.checks as Record<string, unknown>)) {
      if (!knownItems.has(id)) continue
      const normalized = researchPlanCheckStateOf(state)
      if (normalized === DEFAULT_RESEARCH_PLAN_CHECK_STATE) continue
      draft.checks[id] = normalized
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
