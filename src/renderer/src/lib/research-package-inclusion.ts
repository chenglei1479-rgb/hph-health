import type { ProjectFileItem } from '../../../shared/project-files'
import { usePackageOperationStore } from '@/stores/package-operation-store'
import { useSessionStore } from '@/stores/session-store'

import { exportSessionPackage } from './session-package-export'

// Adds one Project file to the research package by opening the export selector with that file
// already checked. The bytes that travel are the Version's own content, not the thumbnail, and the
// reader still confirms the selection — nothing is added silently.
// Returns false when the selector could not be opened (Session still active, pending approval, or
// another package operation running), so the caller can explain the failure instead of dropping it.
export const addFileToResearchPackage = async (file: ProjectFileItem): Promise<boolean> => {
  const session = useSessionStore
    .getState()
    .sessions.find(
      (candidate) => candidate.id === file.sessionId && candidate.projectId === file.projectId
    )
  if (!session) return false

  const store = usePackageOperationStore.getState()
  // A second request replaces the first; `receive` consumes it for the next selection snapshot.
  store.preselectResearchPackageFile({ fileId: file.sourceFileId, filename: file.name })
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
