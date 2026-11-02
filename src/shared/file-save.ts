type SaveBlobFileRequest = {
  suggestedName: string
  mimeType: string
  /** Raw file bytes from the renderer process. */
  data: ArrayBuffer
}

const WEB_MANAGED_FILE_SIZE_LIMIT_ERROR_NAME = 'WebManagedFileSizeLimitError'

type SaveBlobFileResult = {
  saved: boolean
  filePath?: string
}

type SaveManagedVersionFileRequest = {
  source: 'artifact' | 'upload'
  projectId: string
  fileId: string
  versionId?: string
  suggestedName: string
}

type SavePathFileRequest = {
  source: 'notebook-input' | 'literature' | 'local'
  path: string
  suggestedName: string
}

type SaveManagedFileRequest = SaveManagedVersionFileRequest | SavePathFileRequest

type SaveManagedFileResult = SaveBlobFileResult

type SaveSessionArtifactFile = {
  fileId: string
  versionId: string
  suggestedName: string
}

type SaveSessionArtifactsRequest = {
  projectId: string
  sessionId: string
  files: SaveSessionArtifactFile[]
}

type SaveSessionArtifactFailure = SaveSessionArtifactFile & {
  message: string
}

type SaveSessionArtifactsResult =
  { saved: false } | { saved: true; filePaths: string[]; failures?: SaveSessionArtifactFailure[] }

type SaveProjectArtifactFile = {
  source: 'artifact' | 'upload'
  sessionId: string
  fileId: string
  versionId: string
  suggestedName: string
}

type SaveProjectArtifactsRequest = {
  projectId: string
  // Presentation-only filename seed prepared by the renderer. Project identity stays with projectId.
  suggestedArchiveName: string
  files: SaveProjectArtifactFile[]
}

type SaveProjectArtifactFailure = SaveProjectArtifactFile & {
  message: string
}

// filePath is absent when every file fails after Save As confirmation: no archive is written.
type SaveProjectArtifactsResult =
  { saved: false } | { saved: true; filePath?: string; failures?: SaveProjectArtifactFailure[] }

// Stable code for a saved copy whose bytes did not match the Version record. The copy is deleted and the
// original Artifact is untouched, so the renderer can explain it and support can quote the code (#122).
const MANAGED_FILE_CHECKSUM_MISMATCH_CODE = 'managed-file-checksum-mismatch' as const

// Stable code for a Version whose content is gone from disk. The download button stays enabled so the
// reader gets this answer instead of a dead control, and support can quote the code (#122).
const MANAGED_FILE_MISSING_CODE = 'managed-file-missing' as const

export {
  MANAGED_FILE_CHECKSUM_MISMATCH_CODE,
  MANAGED_FILE_MISSING_CODE,
  WEB_MANAGED_FILE_SIZE_LIMIT_ERROR_NAME
}
export type {
  SaveBlobFileRequest,
  SaveBlobFileResult,
  SaveManagedFileRequest,
  SaveManagedFileResult,
  SaveProjectArtifactFailure,
  SaveProjectArtifactFile,
  SaveProjectArtifactsRequest,
  SaveProjectArtifactsResult,
  SaveSessionArtifactFailure,
  SaveSessionArtifactFile,
  SaveSessionArtifactsRequest,
  SaveSessionArtifactsResult
}
