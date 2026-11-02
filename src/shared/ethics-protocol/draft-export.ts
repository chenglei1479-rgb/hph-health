// The draft export either produces file bytes or names why it produced none. It never rejects:
// a rejected IPC call reaches the renderer as a bare Error with no code, and #132 is what that
// costs when the panel has nobody listening — the doctor clicked twelve times and saw nothing.
export type EthicsDraftExportFailureCode =
  | 'ethics-draft-project-missing'
  | 'ethics-draft-blocked-phi'
  | 'ethics-draft-failed'
  // Raised by the renderer, never by main: the window cannot reach the export bridge at all.
  | 'ethics-draft-bridge-unavailable'

export type EthicsDraftExportResult =
  | { ok: true; fileName: string; bytes: number[] }
  | { ok: false; code: EthicsDraftExportFailureCode; fileName: string }

export const ETHICS_DRAFT_FILE_NAME = '研究計画書_草案.docx'
