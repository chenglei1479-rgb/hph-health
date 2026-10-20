import type { PhiCategory, PhiSpan } from './detect'
import { detectPhi } from './detect'
import { formatShiftedDate } from './dates'
import type { PhiStore } from './store'

export interface PhiReplacement {
  start: number
  end: number
  category: PhiCategory
  original: string
  replacement: string
  shifted: boolean
}

export interface PhiResult {
  text: string
  replacements: PhiReplacement[]
  warnings: string[]
}

export interface DeidentifyOptions {
  allowOriginal?: readonly string[]
}

const HIGH_RISK = new Set<PhiCategory>(['MY_NUMBER', 'INSURER_NO', 'INSURED_ID', 'KARTE_NO'])

const LABELS: Record<PhiCategory, string> = {
  PERSON_NAME: '患者',
  PHYSICIAN_NAME: '職員',
  DATE: '日付',
  ADDRESS: '住所',
  PHONE: '電話',
  EMAIL: 'メール',
  FACILITY: '施設',
  KARTE_NO: '番号',
  INSURER_NO: '番号',
  INSURED_ID: '番号',
  MY_NUMBER: '番号'
}

export const MY_NUMBER_WARNING = '研究データから削除してください'

function isHighRisk(span: PhiSpan): boolean {
  return HIGH_RISK.has(span.category) || span.ageGe90 === true
}

function contained(inner: PhiSpan, outer: PhiSpan): boolean {
  return (
    inner !== outer &&
    inner.start >= outer.start &&
    inner.end <= outer.end &&
    (inner.start > outer.start || inner.end < outer.end)
  )
}

function ageReplacement(span: PhiSpan, value: string): string {
  const label = span.text.match(/^(年齢\s*[:：]\s*|Age\s+|享年\s*)/)
  return label ? `${label[1]}${value}` : value
}

export function deidentify(
  text: string,
  store: PhiStore,
  options: DeidentifyOptions = {}
): PhiResult {
  // Scan the whole string on every request. Known vault substitutions are already masked;
  // do not turn e.g. 患者：[患者1] into a fresh placeholder on every tool hop.
  // A detection extending beyond a substitution still requires a new replacement.
  const protectedSpans = store
    .highlights(text)
    .filter((mark) =>
      /^\[(?:患者|職員|日付|住所|電話|メール|施設|番号|年齢|追記)\d+\]$/u.test(
        text.slice(mark.start, mark.end)
      )
    )
  const detected = detectPhi(text).filter(
    (span) => !protectedSpans.some((mark) => span.start >= mark.start && span.end <= mark.end)
  )
  const spans = detected.filter((span) => !detected.some((other) => contained(span, other)))
  const allow = new Set(options.allowOriginal ?? [])
  const replacements: PhiReplacement[] = []
  const counts: Record<string, number> = {}
  let patientPseudonym = '[患者0]'

  const identifierSpans = spans.filter(
    (span) => span.category === 'KARTE_NO' || span.category === 'PERSON_NAME'
  )
  const primary = identifierSpans.find((span) => span.category === 'KARTE_NO') ?? identifierSpans[0]
  if (primary) {
    patientPseudonym = store.placeholder(primary.category, primary.text, LABELS[primary.category])
  }

  for (const span of spans) {
    counts[span.category] = (counts[span.category] ?? 0) + 1
    if (!isHighRisk(span) && allow.has(span.text)) {
      store.log('allow', { [span.category]: 1 })
      continue
    }
    if (span.category === 'DATE' && span.kind === 'document') continue
    if (span.category === 'DATE' && (span.ageGe90 || span.kind === 'age')) {
      const value = span.ageGe90 ? '90歳以上' : store.placeholder('DATE', span.text, '年齢')
      if (span.ageGe90) store.placeholder('DATE', span.text, '年齢')
      replacements.push({
        start: span.start,
        end: span.end,
        category: span.category,
        original: span.text,
        replacement: ageReplacement(span, value),
        shifted: false
      })
      continue
    }
    if (span.category === 'DATE' && span.parsed && span.shift !== false) {
      const replacement = formatShiftedDate(
        span.text,
        span.parsed,
        store.dateOffset(patientPseudonym)
      )
      store.rememberShift(replacement, span.text)
      replacements.push({
        start: span.start,
        end: span.end,
        category: span.category,
        original: span.text,
        replacement,
        shifted: true
      })
      continue
    }
    if (span === primary) {
      replacements.push({
        start: span.start,
        end: span.end,
        category: span.category,
        original: span.text,
        replacement: patientPseudonym,
        shifted: false
      })
      continue
    }
    const label = LABELS[span.category]
    replacements.push({
      start: span.start,
      end: span.end,
      category: span.category,
      original: span.text,
      replacement: store.placeholder(span.category, span.text, label),
      shifted: false
    })
  }

  let redacted = text
  for (const replacement of [...replacements].sort((a, b) => b.start - a.start)) {
    redacted =
      redacted.slice(0, replacement.start) +
      replacement.replacement +
      redacted.slice(replacement.end)
  }
  store.log('deidentify', counts)
  const warnings = spans.some((span) => span.category === 'MY_NUMBER') ? [MY_NUMBER_WARNING] : []
  return { text: redacted, replacements, warnings }
}
