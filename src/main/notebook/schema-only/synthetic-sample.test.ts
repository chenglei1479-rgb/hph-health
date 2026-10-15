import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type { SchemaColumn } from '../../../shared/schema-notebook'
import { syntheticSampleRows } from './synthetic-sample'

const columns: SchemaColumn[] = [
  { name: 'age', dtype: 'integer' },
  { name: 'group', dtype: 'categorical' }
]

describe('synthetic samples', () => {
  it('depends only on column name, type, and row index', () => {
    const first = syntheticSampleRows(columns, 3)
    const again = syntheticSampleRows(
      columns.map((column) => ({ name: column.name, dtype: column.dtype })),
      3
    )
    expect(again).toEqual(first)
    expect(new Set(first.map((row) => row[0])).size).toBe(3)
    expect(first[0]?.[1]).toBe('カテゴリ1')
    expect(JSON.stringify(first)).not.toContain('山田')
  })

  it('documents that samples read no cell values and lists what reaches the model', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(join(here, 'synthetic-sample.ts'), 'utf8')
    const guide = readFileSync(join(here, '../../../../docs/external-endpoints.md'), 'utf8')
    expect(source).toContain('does not read cell values')
    expect(source).toContain('cannot be copied')
    expect(source).toContain('derived from a real row')
    expect(guide).toContain('column name, the column type, and the row index')
    expect(guide).toContain('does not read cell values')
    expect(guide).toContain('does not derive samples from real rows')
    expect(guide).toContain('column names and column types')
    expect(guide).toContain('the row count')
    expect(guide).toContain('Identifier columns are dropped')
    expect(guide).toContain('at most 12 distinct values')
    expect(guide).toContain('opts in for that column')
    expect(guide).toContain('Notebook execution output')
  })
})
