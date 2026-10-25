import {
  emptyResearchPlanChecklistDraft,
  normalizeResearchPlanChecklistDraft,
  type ResearchPlanChecklistDraft
} from '../../../../shared/s34-research-plan-checklist'

// On-device trial draft, one entry per project: switching projects never mixes answers, and the
// checklist never leaves the machine — this module never calls the network, and no dialog, pack, or
// export path reads the draft. Mirrors the local-only ledger in pack-delivery-ledger.ts.
//
// The key carries an explicit schema version so an incompatible shape change later costs no
// migration: bump the segment, keep normalizeResearchPlanChecklistDraft as the only reader, and drop
// stale keys. Moving the draft into the project store is a load/save swap only — normalize and the
// panel's props stay as they are.
const KEY_PREFIX = 'dra.research-plan-checklist.v1.'

/** Storage key for one project's draft. Tests build fixtures through this, not a literal. */
export const checklistDraftKey = (projectId: string): string => `${KEY_PREFIX}${projectId}`

const keyFor = checklistDraftKey

export const loadResearchPlanChecklistDraft = (
  projectId: string | undefined
): ResearchPlanChecklistDraft => {
  if (!projectId) return emptyResearchPlanChecklistDraft()
  try {
    const raw = localStorage.getItem(keyFor(projectId))
    if (!raw) return emptyResearchPlanChecklistDraft()
    return normalizeResearchPlanChecklistDraft(JSON.parse(raw))
  } catch {
    // A malformed or unreadable draft must not break the mentor-prep surface.
    return emptyResearchPlanChecklistDraft()
  }
}

export const saveResearchPlanChecklistDraft = (
  projectId: string | undefined,
  draft: ResearchPlanChecklistDraft
): ResearchPlanChecklistDraft => {
  const normalized = normalizeResearchPlanChecklistDraft(draft)
  if (!projectId) return normalized
  try {
    if (Object.keys(normalized.checks).length === 0 && Object.keys(normalized.memos).length === 0) {
      localStorage.removeItem(keyFor(projectId))
    } else {
      localStorage.setItem(keyFor(projectId), JSON.stringify(normalized))
    }
  } catch {
    // Storage can be unavailable (quota, private mode); the in-memory draft still works.
  }
  return normalized
}
