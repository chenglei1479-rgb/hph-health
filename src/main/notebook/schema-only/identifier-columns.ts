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

const HEADER_RULES: Array<{ category: string; pattern: RegExp }> = [
  {
    category: 'PERSON_NAME',
    pattern:
      /(患者氏名|患者名|氏名|姓名|フリガナ|カナ氏名|^名前$|patient\s*name|full\s*name|^name$)/i
  },
  {
    category: 'KARTE_NO',
    pattern:
      /(カルテ番号|カルテ\s*no|カルテid|患者番号|患者\s*id|チャート番号|chart\s*number|^id$)/i
  },
  {
    category: 'DATE',
    pattern: /(生年月日|誕生日|生年月|date\s*of\s*birth|birth\s*date|birthdate|^dob$)/i
  },
  { category: 'ADDRESS', pattern: /(住所|番地|^address$)/i },
  { category: 'PHONE', pattern: /(電話|携帯|^phone$|^tel$)/i },
  { category: 'MY_NUMBER', pattern: /(マイナンバー|個人番号|my\s*number)/i },
  { category: 'INSURER_NO', pattern: /保険者番号/ },
  {
    category: 'INSURED_ID',
    pattern: /(被保険者番号|被保険者証|記号番号|保険証番号|保険番号)/
  },
  { category: 'EMAIL', pattern: /(メールアドレス|^e-?mail$)/i }
]

const normalize = (value: string): string => value.normalize('NFKC').trim()

const headerHit = (header: string): { category: string } | undefined => {
  const name = normalize(header)
  if (name === '研究用ID' || name === '研究ID') return undefined
  const rule = HEADER_RULES.find((item) => item.pattern.test(name))
  return rule ? { category: rule.category } : undefined
}

const dominatingSpan = (value: string): { category: string } | undefined => {
  const spans = detectPatientPhiSpans(value).filter((span) => DIRECT_CATEGORIES.has(span.category))
  return spans.find((span) => span.text.length >= Math.ceil(value.length * 0.8))
}

export const DIRECT_IDENTIFIER_COLUMN_WARNING =
  'この列は AI には送信されません。院外にデータを渡す前に、この列を削除してください。'

const messageFor = (): string => DIRECT_IDENTIFIER_COLUMN_WARNING

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
    warnings.push({ column, category, message: messageFor() })
  })
  return warnings
}
