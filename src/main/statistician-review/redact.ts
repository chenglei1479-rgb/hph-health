import type { PhiHighlight } from '../phi/confirm'
import { deidentify, type PhiReplacement } from '../phi/deidentify'
import { detectPhi, type PhiCategory, type PhiSpan } from '../phi/detect'
import { createMemoryPhiVault, type PhiStore } from '../phi/store'
import type { StatisticianResultSheet } from '../../shared/statistician-review-export'

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

const ID_HEADER =
  /^(?:karte(?:_?(?:no|number|id))?|chart(?:_?(?:no|number))?|mrn|patient_?id|subject_?id|カルテ番号|患者番号|患者ID|症例ID)$/i

const AGGREGATE_LABEL =
  /^(?:n|mean|sd|se|median|iqr|ci|p|total|overall|all|group|treatment|control|全体|合計|平均|治療|対照|群)$/i

export const INDIVIDUAL_VALUE_MARK = '[患者単位の値は削除]'
export const BIRTH_DATE_MARK = '[生年月日]'

type Span = { start: number; end: number; replacement: string }

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

const lineSpans = (text: string): Array<{ start: number; end: number; line: string }> => {
  const spans: Array<{ start: number; end: number; line: string }> = []
  let start = 0
  for (const line of text.split('\n')) {
    spans.push({ start, end: start + line.length, line })
    start += line.length + 1
  }
  return spans
}

const cellsOf = (line: string): string[] | null => {
  if (line.includes('\t')) return line.split('\t').map((cell) => cell.trim())
  if (line.includes(',')) return line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''))
  return null
}

const numericCell = (cell: string): boolean => /^-?\d+(?:\.\d+)?$/.test(cell)

const individualLines = (text: string): Span[] => {
  const lines = lineSpans(text)
  const spans: Span[] = []
  let idIndex = -1
  for (const line of lines) {
    const cells = cellsOf(line.line)
    if (!cells) {
      idIndex = -1
      continue
    }
    const header = cells.findIndex((cell) => ID_HEADER.test(cell))
    if (header >= 0 && cells.every((cell) => !numericCell(cell))) {
      idIndex = header
      continue
    }
    if (idIndex < 0 || idIndex >= cells.length) continue
    const id = cells[idIndex]
    const measured = cells.some((cell, index) => index !== idIndex && numericCell(cell))
    if (!measured || id.length === 0 || AGGREGATE_LABEL.test(id)) continue
    spans.push({ start: line.start, end: line.end, replacement: INDIVIDUAL_VALUE_MARK })
  }
  return spans
}

const patternSpans = (text: string, store: PhiStore): Span[] => {
  const spans: Span[] = []
  const karte =
    /(?:カルテ番号|カルテNo\.?|患者番号|患者ID|karte(?:_?(?:no|number|id))?|chart_?(?:no|number)|mrn)\s*(?:<-|=|:|：)\s*['"]?([0-9A-Za-z-]{4,})['"]?/gi
  for (const match of text.matchAll(karte)) {
    const value = match[1]
    const offset = match.index
    if (!value || offset == null) continue
    const start = offset + match[0].lastIndexOf(value)
    spans.push({
      start,
      end: start + value.length,
      replacement: store.placeholder('KARTE_NO', value, '番号')
    })
  }
  const birth =
    /(?:生年月日|誕生日|birth(?:day|_date)?|dob)\s*(?:<-|=|:|：)\s*['"]?(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?)['"]?/gi
  for (const match of text.matchAll(birth)) {
    const value = match[1]
    const offset = match.index
    if (!value || offset == null) continue
    const start = offset + match[0].lastIndexOf(value)
    spans.push({ start, end: start + value.length, replacement: BIRTH_DATE_MARK })
  }
  const sentence =
    /(?:患者|症例|patient|subject)\s*(?:番号|id|ID|No\.?)?\s*[:：]?\s*[0-9A-Za-z-]{4,}[^\n]{0,80}?(?<![A-Za-z])\d+(?:\.\d+)?(?![A-Za-z])/gi
  for (const match of text.matchAll(sentence)) {
    if (match.index == null) continue
    spans.push({
      start: match.index,
      end: match.index + match[0].length,
      replacement: INDIVIDUAL_VALUE_MARK
    })
  }
  const frame =
    /(?:data\.frame|tibble|pd\.DataFrame)\s*\([^)\n]{0,500}?(?:karte|カルテ|patient_id|chart_no|生年月日|birth_date)[^)\n]{0,300}\)/gi
  for (const match of text.matchAll(frame)) {
    if (match.index == null || !/\d/.test(match[0])) continue
    spans.push({
      start: match.index,
      end: match.index + match[0].length,
      replacement: `"${INDIVIDUAL_VALUE_MARK}"`
    })
  }
  return spans
}

const phiSpans = (text: string, store: PhiStore): Span[] => {
  const detected = detectPhi(text)
  const released = deidentify(text, store)
  const spans: Span[] = []
  for (const replacement of released.replacements) {
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

export const remainingExportFindings = (text: string): string[] => {
  const store = createMemoryPhiVault().store('export-check')
  return keepLarger([
    ...phiSpans(text, store),
    ...patternSpans(text, store),
    ...individualLines(text)
  ]).map((span) => text.slice(span.start, span.end))
}

export const redactExportText = (
  value: string,
  store: PhiStore
): { text: string; highlights: PhiHighlight[] } => {
  const text = value.replace(/\r\n/g, '\n')
  const redacted = applySpans(
    text,
    keepLarger([...phiSpans(text, store), ...patternSpans(text, store), ...individualLines(text)])
  )
  const second = applySpans(
    redacted,
    keepLarger([...patternSpans(redacted, store), ...individualLines(redacted)])
  )
  return { text: second, highlights: highlightsIn(second) }
}

export const redactResultSheet = (
  sheet: StatisticianResultSheet,
  store: PhiStore
): StatisticianResultSheet => {
  const idIndexes = sheet.columns.flatMap((column, index) =>
    ID_HEADER.test(column.trim()) ? [index] : []
  )
  const redactCell = (cell: StatisticianResultSheet['rows'][number][number]): typeof cell => {
    if (typeof cell !== 'string') return cell
    return redactExportText(cell, store).text
  }
  return {
    name: redactExportText(sheet.name, store).text,
    columns: sheet.columns.map((column) => redactExportText(column, store).text),
    rows: sheet.rows.map((row) => {
      const identifier = idIndexes.map((index) => String(row[index] ?? '')).join(' ')
      const measured = row.some(
        (cell, index) => !idIndexes.includes(index) && typeof cell === 'number'
      )
      if (
        idIndexes.length > 0 &&
        measured &&
        identifier.trim() &&
        !AGGREGATE_LABEL.test(identifier.trim())
      ) {
        return row.map(() => INDIVIDUAL_VALUE_MARK)
      }
      return row.map(redactCell)
    })
  }
}
