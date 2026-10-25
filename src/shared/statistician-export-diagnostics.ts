// Doctor-facing diagnostics for the statistician package export.
//
// The export used to fail with a bare "Export failed." while the real exception was swallowed in the
// renderer. These codes are stable, content-free and match the English line the main process logs.
export const STATISTICIAN_EXPORT_RESOURCE_CODE = 'WIN-EXPORT-01'
export const STATISTICIAN_EXPORT_WRITE_CODE = 'WIN-EXPORT-02'

export type StatisticianExportFailureCode =
  typeof STATISTICIAN_EXPORT_RESOURCE_CODE | typeof STATISTICIAN_EXPORT_WRITE_CODE

// Missing bundled resource: missing font, missing ESM entry, or a module that cannot be resolved.
const RESOURCE_FAILURE =
  /ENOENT|no such file|not found|PDF font loader is unavailable|Cannot find module|ERR_MODULE_NOT_FOUND|ERR_UNKNOWN_FILE_EXTENSION|asar/iu

/** Resource/loading failures are distinguishable from everything else, which is a write failure. */
export const classifyStatisticianExportFailure = (error: unknown): StatisticianExportFailureCode =>
  RESOURCE_FAILURE.test(error instanceof Error ? `${error.name} ${error.message}` : String(error))
    ? STATISTICIAN_EXPORT_RESOURCE_CODE
    : STATISTICIAN_EXPORT_WRITE_CODE

const REDACTED_PATH = '<path>'

// Node prints the paths this module has to diagnose in several shapes: an ENOENT open argument
// ('C:\Users\Jane Doe\...'), a module URL ('file:///C:/Users/...'), a forward-slash Windows path
// ('C:/Users/...'), a POSIX home ('/Users/...', '/home/...'), and a UNC share ('\\server\share\...').
// The quoted rule replaces a quoted path as one token, which is how Node reports ENOENT and "Cannot
// find module" values; that also stops a space inside a user name from being only partly replaced.
// The unquoted rule covers the same shapes when Node does not quote them. Every absolute form is
// replaced, over- rather than under-matching: a leaked user name in main.log is worse than an
// over-redacted diagnostic.
//
// Known limit: an unquoted Windows path that contains a space ('open C:\Users\Jane Doe\x failed') is
// cut at the space and leaves ' Doe\x'. Node quotes the path for the error classes this channel logs
// (ENOENT / Cannot find module / ERR_UNKNOWN_FILE_EXTENSION), so that shape does not reach here
// unquoted; it is documented rather than guessed at with a greedy rule that would eat whole sentences.
const QUOTED_ABSOLUTE_PATH =
  /(['"`])(?:file:\/\/\/)?(?:[A-Za-z]:[\\/]|\/(?:Users|home)\/|[\\/]{2})[^'"`\n]*?\1/gu
const UNQUOTED_ABSOLUTE_PATH =
  /(?:file:\/\/\/)?[A-Za-z]:[\\/][^\s'"`<>]*|\/(?:Users|home)\/[^\s'"`<>]*|\\\\[^\s'"`<>]*/gu

/**
 * Diagnostic-safe error text: absolute paths (which can carry a user name or a project folder) are
 * replaced, whitespace is collapsed and the result is bounded. Never include output contents.
 */
export const redactStatisticianExportFailureMessage = (error: unknown): string => {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return raw
    .replace(QUOTED_ABSOLUTE_PATH, REDACTED_PATH)
    .replace(UNQUOTED_ABSOLUTE_PATH, REDACTED_PATH)
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 300)
}
