import {
  RESEARCH_ID_COLUMN_NAME,
  type VariableDefinition,
  type VariableDefinitionWarning
} from '../../shared/variable-definition'

const RESEARCH_ID: VariableDefinition = {
  name: RESEARCH_ID_COLUMN_NAME,
  definition: 'この研究の中で症例を識別する番号。カルテ番号は書かない。',
  recordType: '研究用の対応表（このファイルには入れない）',
  coding: '',
  type: 'text',
  allowedRange: ''
}

const IDENTIFIER_RULES: Array<{ label: string; pattern: RegExp }> = [
  {
    label: '氏名',
    pattern:
      /(患者氏名|患者名|氏名|姓名|フリガナ|カナ氏名|氏名カナ|フルネーム|patient\s*name|full\s*name|^name$|^名前$)/i
  },
  {
    label: 'カルテ番号',
    pattern:
      /(カルテ番号|カルテ\s*no|カルテid|患者番号|患者\s*id|チャート番号|chart\s*number|medical\s*record|^id$)/i
  },
  {
    label: '生年月日',
    pattern: /(生年月日|誕生日|生年月|date\s*of\s*birth|birth\s*date|birthdate|\bdob\b)/i
  },
  { label: '住所', pattern: /(住所|番地|^address$|patient\s*address)/i },
  { label: '電話', pattern: /(電話|携帯|phone|\btel\b)/i },
  { label: 'マイナンバー', pattern: /(マイナンバー|個人番号|my\s*number)/i },
  { label: '保険番号', pattern: /(保険者番号|被保険者|保険証|保険番号|insurance\s*number)/i },
  { label: 'メール', pattern: /(メールアドレス|e-?mail)/i }
]

const INTERVAL_NAME = /日数|日間/

const RAW_DATE_NAME =
  /年月日|誕生日|入院日|退院日|手術日|検査日|診断日|死亡日|受診日|来院日|実施日|登録日|日付|\bdate\b/i

const normalizeName = (name: string): string => name.normalize('NFKC').trim()

export const directIdentifierLabel = (name: string): string | undefined => {
  const normalized = normalizeName(name)
  if (normalized === RESEARCH_ID_COLUMN_NAME || normalized === '研究ID') return undefined
  return IDENTIFIER_RULES.find((rule) => rule.pattern.test(normalized))?.label
}

export const isRawDateColumn = (variable: VariableDefinition): boolean => {
  const name = normalizeName(variable.name)
  if (INTERVAL_NAME.test(name)) return false
  if (directIdentifierLabel(name)) return false
  if (variable.type === 'date') return true
  return RAW_DATE_NAME.test(name)
}

const droppedMessage = (name: string, label: string): string =>
  `「${name}」は直接識別子（${label}）のため、収集テンプレートから除きました。`

const rawDateMessage = (name: string): string =>
  `「${name}」は暦日です。在院日数や退院〜再入院日数のような日数の列を優先してください。どうしても暦日が必要な場合だけ残しています。`

/** Puts 研究用ID first, drops direct identifiers, and flags raw dates. Idempotent. */
export const prepareVariableDefinitions = (
  variables: VariableDefinition[]
): { variables: VariableDefinition[]; warnings: VariableDefinitionWarning[] } => {
  const warnings: VariableDefinitionWarning[] = []
  const kept: VariableDefinition[] = []
  for (const variable of variables) {
    const label = directIdentifierLabel(variable.name)
    if (label) {
      warnings.push({
        code: 'dropped-identifier',
        name: variable.name,
        message: droppedMessage(variable.name, label)
      })
      continue
    }
    if (isRawDateColumn(variable)) {
      warnings.push({
        code: 'raw-date',
        name: variable.name,
        message: rawDateMessage(variable.name)
      })
    }
    if (normalizeName(variable.name) === RESEARCH_ID_COLUMN_NAME) continue
    kept.push(variable)
  }
  const existing = variables.find(
    (variable) => normalizeName(variable.name) === RESEARCH_ID_COLUMN_NAME
  )
  return {
    variables: [existing ?? RESEARCH_ID, ...kept],
    warnings
  }
}
