import type { TFunction } from 'i18next'

import {
  ApplicationCommandError,
  isApplicationCommandErrorCode
} from '../../../shared/application-command-contract'

// One shared code -> operable copy map for structured ApplicationCommandError failures. Every notice
// surface resolves through this module instead of rendering the English message the main process
// produced, so a doctor never reads internal exception chrome such as `ApplicationCommandError: ...`.
//
// The keys are English source text (see AGENTS.md): English renders the key verbatim, and every
// translated locale carries the same key in the renderer namespace. The diagnostic code always
// travels through {{code}} so support can identify the failure without asking for logs.
//
// Codes are grouped by the action a doctor can take. Add a new code to a branch here (or leave it to
// the fallback, which still shows the code) rather than adding screen-specific copy. Failure classes
// that ship their own stable codes later (protected execution, statistician export) extend this table
// instead of starting a second mapping.

const applicationCommandErrorCode = (error: unknown): string | undefined => {
  if (error instanceof ApplicationCommandError) return error.code
  if (typeof error !== 'object' || error === null) return undefined

  // Envelopes cross contextBridge as plain objects. An arbitrary thrown object with a `code` field
  // must not be re-labeled: Node reports EACCES through that field, and its English detail is still
  // the most useful text. Only codes this build publishes, or an object serialized from the class,
  // count as command failures.
  const candidate = error as { code?: unknown; message?: unknown; name?: unknown }
  if (typeof candidate.code !== 'string' || candidate.code.length === 0) return undefined
  if (typeof candidate.message !== 'string') return undefined
  if (isApplicationCommandErrorCode(candidate.code)) return candidate.code
  return candidate.name === 'ApplicationCommandError' ? candidate.code : undefined
}

// Resolves the actionable copy for a command error code. Unknown codes — including codes a newer
// backend adds before this renderer knows them — keep the generic fallback and the code itself, which
// is always more useful than an English class name.
const localizeApplicationCommandCode = (code: string, t: TFunction): string => {
  switch (code) {
    case 'command-failed':
    case 'invalid-command-arguments':
    case 'invalid-command-result':
      return t(
        'The app could not finish that action. Retry. If it keeps failing, reload the app. (Code: {{code}})',
        { code }
      )
    case 'command-unavailable':
      return t(
        'The app is not connected to its backend right now. Wait a moment, then retry. (Code: {{code}})',
        { code }
      )
    case 'settings-storage-unavailable':
    case 'settings-invalid':
      return t(
        'Settings could not be saved on this device. Check free disk space and folder permissions, then retry. (Code: {{code}})',
        { code }
      )
    case 'settings-credential-unavailable':
      return t(
        'The system credential store is locked or unavailable. Unlock it, then retry. (Code: {{code}})',
        { code }
      )
    case 'session-size-limit':
      return t(
        'This Session has reached its size limit. Start a new Session or remove large attachments, then retry. (Code: {{code}})',
        { code }
      )
    case 'session-details-conflict':
    case 'session-revision-conflict':
    case 'SESSION_RUNTIME_WRITER_LOST':
      return t('This Session changed in another window. Reopen it, then retry. (Code: {{code}})', {
        code
      })
    // Citation-style failures keep their detailed per-code copy in the literature import surface
    // (CitationStylesView); this is the shared fallback for the same codes anywhere else.
    case 'csl-file-too-large':
    case 'csl-invalid-xml':
    case 'csl-unsupported-doctype':
    case 'csl-unsupported-style':
    case 'csl-missing-metadata':
    case 'csl-dependent-style':
    case 'csl-undefined-macro':
    case 'csl-missing-sections':
      return t(
        'The citation style file could not be imported. Check that it is a valid, independent CSL 1.0 style, then retry. (Code: {{code}})',
        { code }
      )
    default:
      return t(
        'The app could not complete that action. Retry. If it keeps happening, report this code when asking for help. (Code: {{code}})',
        { code }
      )
  }
}

// Returns undefined for anything that is not a structured command failure so callers keep their
// existing detail (raw backend text stays in diagnostics and logs, which remain English).
const localizeApplicationCommandError = (error: unknown, t: TFunction): string | undefined => {
  const code = applicationCommandErrorCode(error)
  return code === undefined ? undefined : localizeApplicationCommandCode(code, t)
}

export { localizeApplicationCommandCode, localizeApplicationCommandError }
