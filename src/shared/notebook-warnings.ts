// Structured interpreter warnings are independent of stderr and execution lifecycle status.
// Match the Python producer's count cap; bound historical/custom producer input as well.
export const NOTEBOOK_WARNING_COUNT_LIMIT = 32
export const NOTEBOOK_WARNING_TEXT_LIMIT = 16 * 1024

// Slice inside the UTF-16 budget without splitting a code point: a warning that ends in an astral
// character (emoji, some CJK extensions) would otherwise leave a lone high surrogate in both the
// stored warning and its stderr copy.
const clipWarningText = (text: string, limit: number): string => {
  if (text.length <= limit) return text
  const clipped = text.slice(0, limit)
  const last = clipped.charCodeAt(clipped.length - 1)
  return last >= 0xd800 && last <= 0xdbff ? clipped.slice(0, -1) : clipped
}

export const normalizeNotebookWarnings = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  let remaining = NOTEBOOK_WARNING_TEXT_LIMIT
  const warnings: string[] = []
  for (const entry of value) {
    if (warnings.length >= NOTEBOOK_WARNING_COUNT_LIMIT || remaining <= 0) break
    if (typeof entry !== 'string' || entry.length === 0) continue
    const text = clipWarningText(entry, remaining)
    warnings.push(text)
    remaining -= text.length
  }
  return warnings
}
