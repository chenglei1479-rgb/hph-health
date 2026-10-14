import type { PatientPhiSpan } from '../../../shared/schema-notebook'

// Local stand-in for the patient-PHI categories in PR #7. Offsets are into the
// scanned text (the CSV source, or a cell dump for workbooks).

type Rule = {
  category: string
  pattern: RegExp
  group: number
}

const RULES: Rule[] = [
  {
    category: 'EMAIL',
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    group: 0
  },
  {
    category: 'PHONE',
    pattern: /(?:\+81[-\s]?)?0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}/g,
    group: 0
  },
  {
    category: 'MY_NUMBER',
    pattern: /(?:マイナンバー|個人番号|My Number)\s*[:：]?\s*(\d{4}(?:[-\s]\d{4}){2}|\d{12})/g,
    group: 1
  },
  {
    category: 'KARTE_NO',
    pattern: /(?:カルテ番号|患者番号|患者ID)\s*[:：]?\s*([0-9A-Za-z-]{4,})/g,
    group: 1
  },
  {
    category: 'INSURER_NO',
    pattern: /保険者番号\s*[:：]?\s*(\d{6,8})/g,
    group: 1
  },
  {
    category: 'INSURED_ID',
    pattern: /(?:被保険者番号|記号番号)\s*[:：]?\s*([0-9A-Za-z-]{4,})/g,
    group: 1
  },
  {
    category: 'PERSON_NAME',
    pattern: /(?:患者氏名|患者名|氏名)\s*[:：]\s*([^\s,、。"']{1,40})/g,
    group: 1
  },
  {
    category: 'ADDRESS',
    pattern: /(?:住所|番地)\s*[:：]\s*([^\s,、]{2,80})/g,
    group: 1
  },
  {
    category: 'DATE',
    pattern: /(?:生年月日|誕生日)\s*[:：]?\s*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?)/g,
    group: 1
  }
]

const overlaps = (spans: PatientPhiSpan[], start: number, end: number): boolean =>
  spans.some((span) => start < span.end && end > span.start)

/**
 * TODO(phi-gate): PR #7 adds `detectPhi` in `src/main/phi/detect.ts` and filters
 * patient categories inside `patientSpans` in `src/main/phi/gate.ts`. When that
 * module is on main, delegate here and delete these local rules. Do not import
 * `src/main/phi/` until that pull request is merged.
 */
export const detectPatientPhiSpans = (text: string): PatientPhiSpan[] => {
  const spans: PatientPhiSpan[] = []
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0
    for (const match of text.matchAll(rule.pattern)) {
      const piece = match[rule.group]
      if (!piece || match.index === undefined) continue
      const start = rule.group === 0 ? match.index : match.index + match[0].indexOf(piece)
      const end = start + piece.length
      if (overlaps(spans, start, end)) continue
      spans.push({
        start,
        end,
        category: rule.category,
        text: piece,
        reason: `${rule.category} [${start}, ${end}]: ${piece}`
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
