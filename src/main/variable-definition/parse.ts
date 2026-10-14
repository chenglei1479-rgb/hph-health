import {
  VARIABLE_DEFINITION_TYPES,
  type VariableDefinition,
  type VariableDefinitionType
} from '../../shared/variable-definition'

const TYPE_ALIASES: Record<string, VariableDefinitionType> = {
  integer: 'integer',
  number: 'number',
  binary: 'binary',
  categorical: 'categorical',
  date: 'date',
  text: 'text',
  整数: 'integer',
  数値: 'number',
  二値: 'binary',
  カテゴリ: 'categorical',
  日付: 'date',
  文字: 'text',
  テキスト: 'text'
}

const textOf = (record: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

const stripFence = (raw: string): string => {
  const trimmed = raw.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)
  return fenced ? fenced[1].trim() : trimmed
}

export const parseVariableDefinitions = (raw: string): VariableDefinition[] => {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripFence(raw))
  } catch {
    throw new Error('変数定義を読み取れませんでした。')
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('変数定義を読み取れませんでした。')
  }
  const names = new Set<string>()
  return parsed.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('変数定義を読み取れませんでした。')
    const record = item as Record<string, unknown>
    const name = textOf(record, ['name', '変数名'])
    if (!name || /[\r\n,]/.test(name)) throw new Error('変数名が空か、表の見出しに使えません。')
    if (names.has(name)) throw new Error(`変数名が重複しています: ${name}`)
    names.add(name)
    const typeName = textOf(record, ['type', '型']).toLowerCase()
    const type = TYPE_ALIASES[typeName] ?? TYPE_ALIASES[textOf(record, ['type', '型'])]
    if (!type || !VARIABLE_DEFINITION_TYPES.includes(type)) {
      throw new Error(`変数「${name}」の型が不明です。`)
    }
    return {
      name,
      definition: textOf(record, ['definition', '定義']),
      recordType: textOf(record, ['recordType', '判断する記録', '記録']),
      coding: textOf(record, ['coding', 'コーディング']),
      type,
      allowedRange: textOf(record, ['allowedRange', '許容範囲'])
    }
  })
}
