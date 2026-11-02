import type { ProjectFileItem } from '../../../shared/project-files'
import { usePackageOperationStore } from '@/stores/package-operation-store'
import { useSessionStore } from '@/stores/session-store'

import { exportSessionPackage } from './session-package-export'

// Minimal identity a preview surface, a message card, or a Project-files row can supply. Session
// coordinates are optional because a local preview and a not-yet-attached upload have none;
// `versionId` is optional because a surface may only know the file, and then every Version of it is
// checked. Surfaces that know which Version is on screen always pass it.
export type ResearchPackageTarget = {
  projectId?: string
  sessionId?: string
  fileId?: string
  versionId?: string
  filename: string
}

type SessionCoordinates = Required<Pick<ResearchPackageTarget, 'projectId' | 'sessionId' | 'fileId'>>

const sessionCoordinates = (
  target: ResearchPackageTarget
): SessionCoordinates | undefined =>
  target.projectId && target.sessionId && target.fileId
    ? { projectId: target.projectId, sessionId: target.sessionId, fileId: target.fileId }
    : undefined

// One mapping from a Files row to a package target, so the row action and its visibility check can
// never disagree about which Version they mean.
export const researchPackageTargetForFile = (file: ProjectFileItem): ResearchPackageTarget => ({
  projectId: file.projectId,
  sessionId: file.sessionId,
  fileId: file.sourceFileId,
  versionId: file.sourceVersionId,
  filename: file.name
})

// True when the target can be offered at all: a package export is per Session, so a file without a
// real owning Session (local paths, uploads still on the pending pseudo-session) has nothing to
// add, and offering the action there would only produce a failure the reader cannot act on.
//
// This relies on the Session list being fully hydrated at startup: `session-persistence.ts` runs
// `loadAll` → `hydrateSessions` before the workspace renders. If Session loading ever becomes lazy,
// this returns false for real Sessions and every "add to research package" entry disappears without
// an error — rework this predicate together with that change.
// Callers inside React pass the Session list they already subscribe to, so hydration completing
// re-evaluates the entry instead of leaving a stale answer behind.
export const canAddFileToResearchPackage = (
  target: ResearchPackageTarget,
  sessions: readonly { id: string; projectId: string }[] = useSessionStore.getState().sessions
): boolean => {
  const coordinates = sessionCoordinates(target)
  if (!coordinates) return false
  return sessions.some(
    (candidate) =>
      candidate.id === coordinates.sessionId && candidate.projectId === coordinates.projectId
  )
}

// Adds one file to the research package by opening the Session's export selector with that file
// already checked. The bytes that travel are the Version's own content, not the thumbnail, and the
// reader still confirms the selection — nothing is added silently.
// Returns false when the selector could not be opened (no owning Session, Session still active,
// pending approval, or another package operation running), so callers can explain the failure.
export const addFileToResearchPackage = async (
  target: ResearchPackageTarget
): Promise<boolean> => {
  const coordinates = sessionCoordinates(target)
  if (!coordinates) return false
  const session = useSessionStore
    .getState()
    .sessions.find(
      (candidate) =>
        candidate.id === coordinates.sessionId && candidate.projectId === coordinates.projectId
    )
  if (!session) return false

  const store = usePackageOperationStore.getState()
  // A second request replaces the first; `receive` consumes it for the next selection snapshot.
  store.preselectResearchPackageFile({
    fileId: coordinates.fileId,
    ...(target.versionId ? { versionId: target.versionId } : {}),
    filename: target.filename
  })
  try {
    const started = await exportSessionPackage(session)
    if (!started) {
      usePackageOperationStore.getState().clearPreselect()
      return false
    }
    return true
  } catch (error) {
    usePackageOperationStore.getState().clearPreselect()
    throw error
  }
}
