import type { SchemaColumn, SchemaDtype } from '../../../shared/schema-notebook'

// Samples are a pure function of the column name, dtype, and row index.
// This module does not accept cell values, so it cannot copy a real row.

const hashText = (text: string): number => {
  let value = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

const integerSample = (column: SchemaColumn, rowIndex: number): string => {
  const band = 900_000 + (hashText(column.name) % 500)
  return String(band + rowIndex)
}

const sampleFor = (column: SchemaColumn, rowIndex: number): string => {
  const dtype: SchemaDtype = column.dtype
  if (dtype === 'integer') return integerSample(column, rowIndex)
  if (dtype === 'number') return `${integerSample(column, rowIndex)}.5`
  if (dtype === 'binary') return rowIndex % 2 === 0 ? '0' : '1'
  if (dtype === 'categorical') return `カテゴリ${(rowIndex % 3) + 1}`
  if (dtype === 'date') {
    const day = String(rowIndex + 1).padStart(2, '0')
    return `1900-01-${day}`
  }
  return `テキスト例${rowIndex + 1}`
}

export const syntheticSampleRows = (
  columns: readonly SchemaColumn[],
  sampleCount = 3
): string[][] => {
  const rows: string[][] = []
  for (let rowIndex = 0; rowIndex < sampleCount; rowIndex += 1) {
    rows.push(columns.map((column) => sampleFor(column, rowIndex)))
  }
  return rows
}
