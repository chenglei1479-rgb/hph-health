import type { PhiHighlight } from '../phi/confirm'
import { deidentify, type PhiReplacement } from '../phi/deidentify'
import { detectPhi, type PhiCategory, type PhiSpan } from '../phi/detect'
import type { PhiStore } from '../phi/store'
import {
  inspectExportFile,
  locateExportMatches,
  type ExportMatch
} from '../../shared/writing-safeguards/export-deidentify'

const IDENTIFIERS = new Set<PhiCategory>([
  'KARTE_NO',
  'PERSON_NAME',
  'MY_NUMBER',
  'PHONE',
  'EMAIL',
  'ADDRESS',
  'INSURER_NO',
  'INSURED_ID'
])

const BIRTH_LABEL = /(?:生年月日|誕生日|birth(?:day|_date)?|dob)\s*(?:<-|=|:|：)?\s*['"]?\s*$/i

export const INDIVIDUAL_VALUE_MARK = '[患者単位の値は削除]'
export const BIRTH_DATE_MARK = '[生年月日]'

type Span = { start: number; end: number; replacement: string }

// A variable dictionary row is a table row, not prose: its cells are a column name, a definition, a
// type and a coding. A cell that merely looks like a Japanese word — 肺癌, 内科, 年齢（歳） — is a label,
// and replacing the row destroys the dictionary. Only a cell that carries a name label of its own
// (`氏名：山田太郎`) holds a patient name, and then only the value is replaced.
//
// The guess is scoped to one row on purpose: `detectPhi` emits a single span over the whole string it
// is given, so handing it a whole dictionary would turn "any label anywhere" into "the entire
// dictionary becomes [患者N]".
//
// This mirrors the connector and Notebook patches (gate.ts, notebook-phi-release.ts); converging all
// of them is tracked separately as issue #92, and this file must not grow its own wider rule.
const NAMED_VALUE = /(?:患者氏名|患者名|氏名)\s*[:：]\s*([^\t\n]{1,40})/gu

/** A row that carries its own name label holds exactly one patient name: the value after the label. */
const labeledNameSpans = (text: string, store: PhiStore): Span[] => {
  const spans: Span[] = []
  for (const match of text.matchAll(NAMED_VALUE)) {
    const value = (match[1] ?? '').trim()
    if (!value) continue
    const start = (match.index ?? 0) + match[0].lastIndexOf(value)
    spans.push({
      start,
      end: start + value.length,
      replacement: store.placeholder('PERSON_NAME', value, '患者')
    })
  }
  return spans
}

const isWholeRowNameGuess = (
  text: string,
  span: { start: number; end: number; category: PhiCategory }
): boolean => {
  if (span.category !== 'PERSON_NAME' && span.category !== 'PHYSICIAN_NAME') return false
  // The guess always covers the whole string it scanned.
  return text.slice(span.start, span.end) === text.trim()
}

export type RedactOptions = {
  /** One table row: never treat the row itself as a name; only a labeled value becomes a patient. */
  structured?: boolean
}

const isBirth = (text: string, span: PhiSpan): boolean => {
  if (span.category !== 'DATE') return false
  if (/生$/.test(span.text)) return true
  return BIRTH_LABEL.test(text.slice(Math.max(0, span.start - 40), span.start))
}

const applySpans = (text: string, spans: readonly Span[]): string => {
  let next = text
  for (const span of [...spans].sort((left, right) => right.start - left.start)) {
    next = next.slice(0, span.start) + span.replacement + next.slice(span.end)
  }
  return next
}

const keepLarger = (spans: Span[]): Span[] => {
  const sorted = [...spans].sort((left, right) => right.end - right.start - (left.end - left.start))
  const kept: Span[] = []
  for (const span of sorted) {
    if (kept.some((other) => span.start < other.end && other.start < span.end)) continue
    kept.push(span)
  }
  return kept.sort((left, right) => left.start - right.start)
}

const replacementFor = (match: ExportMatch, text: string, store: PhiStore): string => {
  const original = text.slice(match.start, match.end)
  if (match.kind === 'karte-number') return store.placeholder('KARTE_NO', original, '番号')
  if (match.kind === 'birth-date') return BIRTH_DATE_MARK
  if (/(?:data\.frame|tibble|pd\.DataFrame)/.test(original)) return `"${INDIVIDUAL_VALUE_MARK}"`
  return INDIVIDUAL_VALUE_MARK
}

const sharedSpans = (text: string, name: string, store: PhiStore): Span[] =>
  locateExportMatches({ name, text }).map((match) => ({
    start: match.start,
    end: match.end,
    replacement: replacementFor(match, text, store)
  }))

const phiSpans = (text: string, store: PhiStore, options: RedactOptions): Span[] => {
  const keepName = (span: { start: number; end: number; category: PhiCategory }): boolean =>
    !options.structured || !isWholeRowNameGuess(text, span)
  const detected = detectPhi(text).filter(keepName)
  const released = deidentify(text, store)
  const spans: Span[] = []
  for (const replacement of released.replacements) {
    if (!keepName(replacement)) continue
    if (IDENTIFIERS.has(replacement.category)) {
      spans.push(fromReplacement(replacement))
      continue
    }
    const span = detected.find(
      (item) => item.start === replacement.start && item.end === replacement.end
    )
    if (span && isBirth(text, span)) {
      spans.push({ ...fromReplacement(replacement), replacement: BIRTH_DATE_MARK })
    }
  }
  for (const span of detected) {
    if (!isBirth(text, span)) continue
    if (spans.some((item) => item.start === span.start && item.end === span.end)) continue
    spans.push({ start: span.start, end: span.end, replacement: BIRTH_DATE_MARK })
  }
  // Structured rows get their names from the label only: the value is replaced, the rest of the row
  // stays readable.
  if (options.structured) spans.push(...labeledNameSpans(text, store))
  return spans
}

const fromReplacement = (replacement: PhiReplacement): Span => ({
  start: replacement.start,
  end: replacement.end,
  replacement: replacement.replacement
})

const highlightsIn = (text: string): PhiHighlight[] => {
  const patterns: Array<{ expression: RegExp; category: PhiHighlight['category'] }> = [
    { expression: /\[番号\d+\]/g, category: 'KARTE_NO' },
    { expression: /\[患者\d+\]/g, category: 'PERSON_NAME' },
    { expression: /\[メール\d+\]/g, category: 'EMAIL' },
    { expression: /\[電話\d+\]/g, category: 'PHONE' },
    { expression: /\[住所\d+\]/g, category: 'ADDRESS' },
    { expression: /\[生年月日\]/g, category: 'DATE' },
    { expression: /\[患者単位の値は削除\]/g, category: 'MANUAL' },
    { expression: /\[追記\d+\]/g, category: 'MANUAL' }
  ]
  const highlights: PhiHighlight[] = []
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern.expression)) {
      if (match.index == null) continue
      highlights.push({
        start: match.index,
        end: match.index + match[0].length,
        category: pattern.category
      })
    }
  }
  return highlights.sort((left, right) => left.start - right.start)
}

export const remainingExportFindings = (name: string, text: string): string[] =>
  inspectExportFile({ name, text }).map((finding) => finding.excerpt)

export type VariableDefinitionRow = {
  name: string
  definition: string
  type: string
  coding: string
}

/**
 * The variable dictionary is redacted one row at a time. `detectPhi` reports a single span across
 * whatever string it is handed, so passing the joined dictionary would make "a label anywhere" replace
 * the whole document; a row is the unit that is actually a table row.
 */
export const redactVariableDefinitionRows = (
  rows: readonly VariableDefinitionRow[],
  store: PhiStore,
  name = 'variable-definition.pdf'
): { text: string; highlights: PhiHighlight[] } => {
  const redactedRows = rows.map((row) =>
    redactExportText([row.name, row.definition, row.type, row.coding].join('\t'), store, name, {
      structured: true
    })
  )
  const parts: string[] = []
  const highlights: PhiHighlight[] = []
  let offset = 0
  for (const part of redactedRows) {
    for (const highlight of part.highlights) {
      highlights.push({
        ...highlight,
        start: highlight.start + offset,
        end: highlight.end + offset
      })
    }
    parts.push(part.text)
    offset += part.text.length + 1
  }
  return { text: parts.join('\n'), highlights }
}

export const redactExportText = (
  value: string,
  store: PhiStore,
  name = 'export.txt',
  options: RedactOptions = {}
): { text: string; highlights: PhiHighlight[] } => {
  const text = value.replace(/\r\n/g, '\n')
  const redacted = applySpans(
    text,
    keepLarger([...phiSpans(text, store, options), ...sharedSpans(text, name, store)])
  )
  const second = applySpans(redacted, keepLarger(sharedSpans(redacted, name, store)))
  return { text: second, highlights: highlightsIn(second) }
}
