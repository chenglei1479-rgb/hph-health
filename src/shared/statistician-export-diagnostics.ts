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
// The quoted rule replaces a quoted path as one token, which is how Node reports ENOENT and the
// "Cannot find module '<id>'" value; that also stops a space inside a user name from being only
// partly replaced. The unquoted rule covers the shapes Node prints without quotes, including the
// `imported from C:\Users\Jane Doe\...` and `Unknown file extension ".otf" for C:\Users\Jane Doe\...`
// lines: there the path itself contains spaces and is not wrapped in quotes.
//
// Every absolute form is replaced, over- rather than under-matching: a leaked user name in main.log
// is worse than an over-redacted diagnostic. The price is that once an unquoted absolute path starts,
// the rest of that line is replaced with it, because a path with spaces cannot be told apart from the
// prose that follows it. That is the accepted trade: the diagnostic still names the failing stage,
// and the message is bounded to 300 characters afterwards.
const QUOTED_ABSOLUTE_PATH =
  /(['"`])(?:file:\/\/\/)?(?:[A-Za-z]:[\\/]|\/(?:Users|home)\/|[\\/]{2})[^'"`\n]*?\1/gu
const UNQUOTED_ABSOLUTE_PATH =
  /(?:file:\/\/\/)?[A-Za-z]:[\\/][^\n'"`<>]*|\/(?:Users|home)\/[^\n'"`<>]*|\\\\[^\n'"`<>]*/gu

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
