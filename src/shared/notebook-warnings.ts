// Structured interpreter warnings are independent of stderr and execution lifecycle status.
// Match the Python producer's count cap; bound historical/custom producer input as well.
export const NOTEBOOK_WARNING_COUNT_LIMIT = 32
export const NOTEBOOK_WARNING_TEXT_LIMIT = 16 * 1024

export const normalizeNotebookWarnings = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  let remaining = NOTEBOOK_WARNING_TEXT_LIMIT
  const warnings: string[] = []
  for (const entry of value) {
    if (warnings.length >= NOTEBOOK_WARNING_COUNT_LIMIT || remaining <= 0) break
    if (typeof entry !== 'string' || entry.length === 0) continue
    const text = entry.slice(0, remaining)
    warnings.push(text)
    remaining -= text.length
  }
  return warnings
}
