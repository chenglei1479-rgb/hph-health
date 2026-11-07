// #167: the import path showed the main process sentence verbatim, so a Japanese interface carried
// English at the moment the reader had to act. Two sentences are actionable and get a catalogue entry;
// everything else stays exactly as written, because an unknown failure is a diagnostic and translating
// it would hide the text people search for when they report it.
//
// Kept as a pure mapping, separate from the component, so each branch has a direct test: the `{{part}}`
// interpolation in particular cannot be verified by the i18n guard, which only checks that a translation
// contains the placeholder, not that the call site supplies it.

/** Strips the Electron transport chrome: "Error invoking remote method '<channel>': Error: <text>". */
export const failureText = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).replace(
    /^Error invoking remote method '[^']*':\s*(?:[A-Za-z]*Error:\s*)?/u,
    ''
  )

export type ImportFailureCopy = { key: string; params?: Record<string, string> }

// `path` here is an OOXML part name from the workbook's zip listing, never a user file path, so the
// interpolation cannot surface anything from the reader's filesystem.
const MISSING_PART = /^Workbook is missing (.+)\.$/u

/** Returns the catalogue entry for a known import failure, or null when the text must be shown as-is. */
export const importFailureCopy = (text: string): ImportFailureCopy | null => {
  if (text === 'Workbook has no worksheets.') {
    return { key: 'This workbook has no worksheets.' }
  }
  const missingPart = MISSING_PART.exec(text)
  if (missingPart) {
    return { key: 'This workbook is missing {{part}}.', params: { part: missingPart[1] } }
  }
  return null
}
