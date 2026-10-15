import type { SchemaColumn, SchemaDtype } from '../../../shared/schema-notebook'

// Synthetic samples are generated only from the column name, the column type,
// and the row index.
//
// This module does not read cell values. `syntheticSampleRows` accepts columns
// and a count. It has no parameter for real rows, so a sample cannot be copied
// from or derived from a real row. The same column name, type, and row index
// always produce the same placeholder.
//
// What reaches the model is documented in docs/external-endpoints.md. By
// default that is column names, types, the row count, and these placeholders.
// Identifier columns are dropped before that context is built. Real categorical
// values are included only after the doctor opts in for that column. Free-text
// columns cannot be opted in. A categorical column with more than 12 distinct
// values stays eligible, and only the 12 most frequent values are released.
// Notebook execution output reaches the model only after the PHI gate, and
// individual patient rows are refused.

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
