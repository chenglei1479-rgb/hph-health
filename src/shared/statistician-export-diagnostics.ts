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

/**
 * Diagnostic-safe error text: absolute paths (which can carry a user name or a project folder) are
 * replaced, whitespace is collapsed and the result is bounded. Never include output contents.
 */
export const redactStatisticianExportFailureMessage = (error: unknown): string => {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return raw
    .replace(/\b[A-Za-z]:\\[^\s"'`<>]+/gu, '<path>')
    .replace(/\/(?:Users|home)\/[^\s"'`<>]+/gu, '<path>')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 300)
}
