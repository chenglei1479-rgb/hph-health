import {
  emptyResearchPlanChecklistDraft,
  normalizeResearchPlanChecklistDraft,
  type ResearchPlanChecklistDraft
} from '../../../../shared/s34-research-plan-checklist'

// On-device trial draft, one entry per project: switching projects never mixes answers, and the
// checklist never leaves the machine. Mirrors the local-only ledger in pack-delivery-ledger.ts.
const KEY_PREFIX = 'dra.research-plan-checklist.'

const keyFor = (projectId: string): string => `${KEY_PREFIX}${projectId}`

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
