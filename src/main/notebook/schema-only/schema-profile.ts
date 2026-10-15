import type { SchemaColumn, SchemaDtype } from '../../../shared/schema-notebook'
import { isOptInCategorical, rankCategoricalValues } from './categorical-release'

export type LocalTable = {
  columns: string[]
  rows: string[][]
}

export type TableProfile = {
  columns: SchemaColumn[]
  rowCount: number
  categoricalValues: ReadonlyMap<string, readonly string[]>
}

const INTEGER = /^-?\d+$/
const NUMBER = /^-?\d+(?:\.\d+)?$/
const DATE = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/

const uniqueValues = (values: string[]): string[] => [...new Set(values)]

const dtypeFor = (values: string[]): SchemaDtype => {
  const present = values.map((value) => value.trim()).filter((value) => value.length > 0)
  if (present.length === 0) return 'text'
  if (present.every((value) => INTEGER.test(value))) return 'integer'
  if (present.every((value) => NUMBER.test(value))) return 'number'
  if (present.every((value) => DATE.test(value))) return 'date'
  const distinct = uniqueValues(present)
  if (
    distinct.length <= 2 &&
    distinct.every((value) =>
      ['0', '1', 'true', 'false', 'あり', 'なし', 'yes', 'no'].includes(value)
    )
  ) {
    return 'binary'
  }
  if (isOptInCategorical(present)) return 'categorical'
  return 'text'
}

/** Schema only. Categorical lists stay in the returned map and are not part of the schema. */
export const profileTable = (table: LocalTable): TableProfile => {
  const columns: SchemaColumn[] = table.columns.map((name, index) => {
    const values = table.rows.map((row) => row[index] ?? '')
    return { name, dtype: dtypeFor(values) }
  })
  const categoricalValues = new Map<string, readonly string[]>()
  columns.forEach((column, index) => {
    if (column.dtype !== 'categorical' && column.dtype !== 'binary') return
    categoricalValues.set(
      column.name,
      rankCategoricalValues(table.rows.map((row) => row[index] ?? ''))
    )
  })
  return { columns, rowCount: table.rows.length, categoricalValues }
}
