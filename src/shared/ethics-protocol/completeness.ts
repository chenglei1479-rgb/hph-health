export type CompletenessStatus =
  | '記載あり'
  | '空缺'
  | '部分空缺'
  | '書式に該当欄なし'
  | '適用要否：要確認'
  | '該当なし（理由あり）'

const PLACEHOLDER_ONLY = /^(?:\{\{[^}]*\}\}|【[^】]*】|[〇○×＿_…・.\s]+)$/u
const INSTRUCTION_LINE = /^(?:記入例|（例）|例：|※)|(?:を記載してください|記入すること)\s*$/u
const UNCHECKED_BOX = /^[☐□\s]+$/u

export const meaningfulTemplateLines = (value: string): string[] =>
  value
    .normalize('NFKC')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !PLACEHOLDER_ONLY.test(line))
    .filter((line) => !INSTRUCTION_LINE.test(line))
    .filter((line) => !UNCHECKED_BOX.test(line))

export const hasMeaningfulTemplateContent = (value: string): boolean =>
  meaningfulTemplateLines(value).length > 0

export type CompletenessRule = {
  requiredSignals: readonly RegExp[]
}

export const evaluateCompleteness = (
  value: string,
  rule?: CompletenessRule
): '空缺' | '部分空缺' | '記載あり' => {
  const lines = meaningfulTemplateLines(value)
  if (lines.length === 0) return '空缺'
  const normalized = lines.join('\n')
  if (rule && !rule.requiredSignals.every((signal) => signal.test(normalized))) return '部分空缺'
  return '記載あり'
}

export const formatNotApplicableText = (item: number, reason: string): string =>
  item >= 16 ? `該当なし（理由：${reason.trim()}）` : `該当なし（${reason.trim()}）`

export const evaluateR8ItemCompleteness = (
  item: number,
  value: string
): '空缺' | '部分空缺' | '記載あり' => {
  const lines = meaningfulTemplateLines(value)
  if (lines.length === 0) return '空缺'
  const normalized = lines.join('\n')
  if (item >= 16 && item <= 25) {
    if (/該当なし|本院では不要/u.test(normalized)) {
      return /該当なし[（(]理由[:：][^）)]+[）)]/u.test(normalized) ? '記載あり' : '部分空缺'
    }
    if (item === 21 && /補償なし/u.test(normalized) && !/理由\s*[:：]\s*\S+/u.test(normalized)) {
      return '部分空缺'
    }
  }
  return evaluateCompleteness(
    normalized,
    R8_COMPLETENESS_RULES[item as keyof typeof R8_COMPLETENESS_RULES]
  )
}

export const R8_COMPLETENESS_RULES = {
  4: { requiredSignals: [/方法/u, /期間/u] },
  5: { requiredSignals: [/選択|選定|組入|包含/u, /除外/u, /期間/u] },
  9: { requiredSignals: [/負担|リスク/u, /利益/u, /総合/u, /最小/u] },
  10: { requiredSignals: [/保管/u, /廃棄/u] },
  12: { requiredSignals: [/資金/u, /利益相反/u] },
  15: { requiredSignals: [/相談/u, /連絡|電話|メール|住所/u] }
} as const satisfies Partial<Record<number, CompletenessRule>>
