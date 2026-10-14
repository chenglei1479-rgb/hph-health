import type { IdentifierColumnWarning } from '../../../shared/schema-notebook'
import { detectPatientPhiSpans } from './patient-phi'

const DIRECT_CATEGORIES = new Set([
  'PERSON_NAME',
  'KARTE_NO',
  'DATE',
  'ADDRESS',
  'PHONE',
  'EMAIL',
  'MY_NUMBER',
  'INSURER_NO',
  'INSURED_ID'
])

const HEADER_RULES: Array<{ category: string; label: string; pattern: RegExp }> = [
  {
    category: 'PERSON_NAME',
    label: '氏名',
    pattern:
      /(患者氏名|患者名|氏名|姓名|フリガナ|カナ氏名|^名前$|patient\s*name|full\s*name|^name$)/i
  },
  {
    category: 'KARTE_NO',
    label: 'カルテ番号',
    pattern:
      /(カルテ番号|カルテ\s*no|カルテid|患者番号|患者\s*id|チャート番号|chart\s*number|^id$)/i
  },
  {
    category: 'DATE',
    label: '生年月日',
    pattern: /(生年月日|誕生日|生年月|date\s*of\s*birth|birth\s*date|birthdate|^dob$)/i
  },
  { category: 'ADDRESS', label: '住所', pattern: /(住所|番地|^address$)/i },
  { category: 'PHONE', label: '電話', pattern: /(電話|携帯|^phone$|^tel$)/i },
  { category: 'MY_NUMBER', label: 'マイナンバー', pattern: /(マイナンバー|個人番号|my\s*number)/i },
  { category: 'INSURER_NO', label: '保険者番号', pattern: /保険者番号/ },
  {
    category: 'INSURED_ID',
    label: '被保険者番号',
    pattern: /(被保険者番号|被保険者証|記号番号|保険証番号|保険番号)/
  },
  { category: 'EMAIL', label: 'メール', pattern: /(メールアドレス|^e-?mail$)/i }
]

const normalize = (value: string): string => value.normalize('NFKC').trim()

const headerHit = (header: string): { category: string; label: string } | undefined => {
  const name = normalize(header)
  if (name === '研究用ID' || name === '研究ID') return undefined
  return HEADER_RULES.find((rule) => rule.pattern.test(name))
}

const dominatingSpan = (value: string): { category: string } | undefined => {
  const spans = detectPatientPhiSpans(value).filter((span) => DIRECT_CATEGORIES.has(span.category))
  return spans.find((span) => span.text.length >= Math.ceil(value.length * 0.8))
}

const messageFor = (column: string, label: string): string =>
  `「${column}」は直接識別子（${label}）です。列名とサンプルはモデルに渡しません。`

/**
 * Runs the PHI detector over each header and each cell. A column is withheld
 * when its header is a direct identifier, or when a cell value is itself a
 * direct identifier rather than a longer note that mentions one.
 */
export const findDirectIdentifierColumns = (
  columns: readonly string[],
  rows: readonly (readonly string[])[]
): IdentifierColumnWarning[] => {
  const warnings: IdentifierColumnWarning[] = []
  columns.forEach((column, index) => {
    const labeled = headerHit(column)
    const headerSpan = detectPatientPhiSpans(column).find((span) =>
      DIRECT_CATEGORIES.has(span.category)
    )
    const valueSpan = rows
      .map((row) => normalize(row[index] ?? ''))
      .filter((value) => value.length > 0)
      .map((value) => dominatingSpan(value))
      .find((span) => span !== undefined)
    const category = labeled?.category ?? headerSpan?.category ?? valueSpan?.category
    if (!category) return
    const label = labeled?.label ?? category
    warnings.push({ column, category, message: messageFor(column, label) })
  })
  return warnings
}
