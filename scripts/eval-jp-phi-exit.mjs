/**
 * Exit code for the Japanese PHI dev eval.
 *
 * Lives apart from `scripts/eval-jp-phi.mjs` because that script has top-level
 * side effects (it spawns vitest and exits), so this decision is what can be
 * tested directly.
 *
 * - No report was written (the run never got that far): vitest's status, but never 0.
 * - A report exists but could not be parsed (`report` is null): the same.
 * - The report says `ok !== true`: fail, so a missed threshold fails CI even if
 *   vitest happened to exit 0.
 * - Otherwise: vitest's status.
 */
export function exitCodeFor({ status, reportPresent, report }) {
  if (!reportPresent || report === null) return status || 1
  if (report.ok !== true) return 1
  return status ?? 1
}
