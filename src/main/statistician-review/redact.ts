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

export const remainingExportFindings = (name: string, text: string): string[] =>
  inspectExportFile({ name, text }).map((finding) => finding.excerpt)

export const redactExportText = (
  value: string,
  store: PhiStore,
  name = 'export.txt'
): { text: string; highlights: PhiHighlight[] } => {
  const text = value.replace(/\r\n/g, '\n')
  const redacted = applySpans(
    text,
    keepLarger([...phiSpans(text, store), ...sharedSpans(text, name, store)])
  )
  const second = applySpans(redacted, keepLarger(sharedSpans(redacted, name, store)))
  return { text: second, highlights: highlightsIn(second) }
}
