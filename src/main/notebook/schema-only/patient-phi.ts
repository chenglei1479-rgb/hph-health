import type { PatientPhiSpan } from '../../../shared/schema-notebook'

// Local stand-in for the patient-PHI categories in PR #7. Offsets are into the
// scanned text (the CSV source, or a cell dump for workbooks).

type Rule = {
  category: string
  /** Stable id quoted in the refusal message and in support logs; never rename it silently. */
  rule: string
  pattern: RegExp
  group: number
}

const RULES: Rule[] = [
  {
    category: 'EMAIL',
    rule: 'schema-email',
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    group: 0
  },
  {
    category: 'PHONE',
    rule: 'schema-phone',
    // Three shapes, because a Japanese number is written three ways and the carrier of the leading
    // zero moves between them (#171). An international number drops that zero, so requiring it after
    // `+81` missed the whole shape; a parenthesised area code hides it behind `(`. The domestic shape
    // keeps its leading `0` right where it was, so nothing that matched before matches less.
    //
    // `(2024)1234-5678` stays unmatched on purpose: the area-code branch requires a leading `0`, and
    // every Japanese area code has one. Widening that to any digits would swallow a date in
    // parentheses followed by two number groups.
    //
    // The left guard wraps all three branches, not just the first: alternation binds tighter than the
    // lookbehind-less prefix once the pattern starts matching mid-number. Without it `2024-2025`
    // matched from the second character (`024-2` + `025`) and a period was redacted into
    // `2[仮名化済み]` — silent corruption of a number the model is meant to receive. The gate always
    // had `(?<![\d])`; this brings the local layer in line.
    pattern:
      /(?<!\d)(?:(?:\+81[-\s]?\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4})|(?:\(0\d{1,4}\)[-\s]?\d{1,4}[-\s]?\d{3,4})|(?:0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}))/g,
    group: 0
  },
  {
    category: 'MY_NUMBER',
    rule: 'schema-my-number',
    pattern: /(?:マイナンバー|個人番号|My Number)\s*[:：]?\s*(\d{4}(?:[-\s]\d{4}){2}|\d{12})/g,
    group: 1
  },
  {
    category: 'KARTE_NO',
    rule: 'schema-karte-no',
    pattern: /(?:カルテ番号|患者番号|患者ID)\s*[:：]?\s*([0-9A-Za-z-]{4,})/g,
    group: 1
  },
  {
    category: 'INSURER_NO',
    rule: 'schema-insurer-no',
    pattern: /保険者番号\s*[:：]?\s*(\d{6,8})/g,
    group: 1
  },
  {
    category: 'INSURED_ID',
    rule: 'schema-insured-id',
    pattern: /(?:被保険者番号|記号番号)\s*[:：]?\s*([0-9A-Za-z-]{4,})/g,
    group: 1
  },
  {
    category: 'PERSON_NAME',
    rule: 'schema-name-label',
    pattern: /(?:患者氏名|患者名|氏名)\s*[:：]\s*([^\s,、。"']{1,40})/g,
    group: 1
  },
  {
    category: 'ADDRESS',
    rule: 'schema-address-label',
    pattern: /(?:住所|番地)\s*[:：]\s*([^\s,、]{2,80})/g,
    group: 1
  },
  {
    category: 'DATE',
    rule: 'schema-birth-date',
    pattern: /(?:生年月日|誕生日)\s*[:：]?\s*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?)/g,
    group: 1
  }
]

const overlaps = (spans: PatientPhiSpan[], start: number, end: number): boolean =>
  spans.some((span) => start < span.end && end > span.start)

// Categories whose match is a bare digit/identifier run. A run that continues a larger number is not
// a token of its own: the PHONE rule used to take "051601268752" out of 1.9773051601268752 and leave
// "1.9773[仮名化済み]" behind, corrupting a computed statistic instead of hiding an identifier.
const NUMERIC_CATEGORIES = new Set(['PHONE', 'MY_NUMBER', 'KARTE_NO', 'INSURER_NO', 'INSURED_ID'])

// True when the match is only a slice of a longer number: it touches a digit on either side, or sits
// across a decimal point from one. Whole tokens ("090-1234-5678" between punctuation, a labelled
// カルテ番号) are unaffected.
//
// Callers must also require the match to be digits only. A hyphenated phone cannot be a continuation
// of a float literal, so skipping one would un-redact it: "1.090-1234-5678" and "TEL 090-1234-5678.2024"
// both look "adjacent to a number" to this check but are real phone numbers.
//
// Known trade-off, accepted deliberately: a bare digit run glued to a decimal, such as "1.09012345678",
// is still skipped as a continuation of the decimal. Hiding it would corrupt computed statistics,
// which is the bug this guard exists to prevent. A real 11-digit number written that way is rare, and
// the downstream PHI gate still scans it.
const continuesNumber = (text: string, start: number, end: number): boolean => {
  const before = text[start - 1]
  const after = text[end]
  const beforePoint = text[start - 2]
  const afterPoint = text[end + 1]
  if (before !== undefined && /\d/u.test(before)) return true
  if (after !== undefined && /\d/u.test(after)) return true
  if (
    before !== undefined &&
    /[.,]/u.test(before) &&
    beforePoint !== undefined &&
    /\d/u.test(beforePoint)
  )
    return true
  return (
    after !== undefined && /[.,]/u.test(after) && afterPoint !== undefined && /\d/u.test(afterPoint)
  )
}

// #175: a Japanese IME produces full-width digits and punctuation by default, while every rule below is
// written in ASCII, so a number typed that way reached the rules unfolded and matched nothing. Folding
// runs before matching and is strictly one code unit to one code unit, so an offset in the folded
// string is the same offset in the original: the redacted text keeps the characters the user typed and
// a refusal still reports true offsets.
//
// The dash family is folded as well. U+2212 MINUS SIGN and U+FF0D FULLWIDTH HYPHEN-MINUS look like the
// ASCII hyphen and both occur in Japanese input, and Unicode normalization leaves U+2212 (and
// U+2010..U+2015) alone — which is why the gate folded the digits but still missed the number.
const DASH_EQUIVALENTS = /[\u2010\u2011\u2013\u2014\u2015\u2212\uff0d]/gu
const WIDTH_FOLD = /[\uff10-\uff19\uff0b\uff08\uff09]/gu

export const foldWidth = (text: string): string =>
  text
    .replace(WIDTH_FOLD, (char) => {
      const code = char.charCodeAt(0)
      // Full-width digits are exactly 0xFEE0 above their ASCII forms.
      if (code >= 0xff10 && code <= 0xff19) return String.fromCharCode(code - 0xfee0)
      if (char === '＋') return '+'
      return char === '（' ? '(' : ')'
    })
    .replace(DASH_EQUIVALENTS, '-')

/**
 * TODO(phi-gate): PR #7 adds `detectPhi` in `src/main/phi/detect.ts` and filters
 * patient categories inside `patientSpans` in `src/main/phi/gate.ts`. When that
 * module is on main, delegate here and delete these local rules. Do not import
 * `src/main/phi/` until that pull request is merged.
 */
export const detectPatientPhiSpans = (text: string): PatientPhiSpan[] => {
  const spans: PatientPhiSpan[] = []
  // Rules see the folded string; spans, offsets and text stay in the original.
  const folded = foldWidth(text)
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0
    for (const match of folded.matchAll(rule.pattern)) {
      const piece = match[rule.group]
      if (!piece || match.index === undefined) continue
      const start = rule.group === 0 ? match.index : match.index + match[0].indexOf(piece)
      const end = start + piece.length
      if (overlaps(spans, start, end)) continue
      // Only a digits-only match can be a slice of a longer number; see continuesNumber. The guard runs
      // on the folded string too, so a full-width decimal continuation behaves like a half-width one.
      if (
        NUMERIC_CATEGORIES.has(rule.category) &&
        /^\d+$/u.test(piece) &&
        continuesNumber(folded, start, end)
      )
        continue
      spans.push({
        start,
        end,
        category: rule.category,
        // The original characters, not the folded ones: the user sees what they typed in a refusal.
        text: text.slice(start, end),
        rule: rule.rule,
        // The reason is shown to the user when an import is refused, so it names the category, the
        // rule and the offsets only. The matched text is never part of it.
        reason: `${rule.category} [${start}, ${end}) rule=${rule.rule}`
      })
    }
  }
  return spans.sort((left, right) => left.start - right.start)
}

/** Mark left in place of patient text. Japanese UI calls this 仮名化済み, never 匿名化. */
export const PSEUDONYMIZED_MARK = '[仮名化済み]'

export const redactPatientPhi = (text: string): string => {
  const spans = [...detectPatientPhiSpans(text)].sort((left, right) => right.start - left.start)
  let next = text
  for (const span of spans) {
    next = `${next.slice(0, span.start)}${PSEUDONYMIZED_MARK}${next.slice(span.end)}`
  }
  return next
}

export const formatBlockedImport = (spans: readonly PatientPhiSpan[]): string => {
  const lines = spans.map((span) => span.reason)
  return [
    'この端末は病院の承認を受けていません。患者の個人情報が含まれるファイルは取り込めません。',
    ...lines
  ].join('\n')
}
