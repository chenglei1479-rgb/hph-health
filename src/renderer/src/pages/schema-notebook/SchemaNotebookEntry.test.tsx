// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ImportTableResponse } from '../../../../shared/schema-notebook'
import { SchemaNotebookEntry } from './SchemaNotebookEntry'

const tags = vi.fn(async () => [{ projectId: 'study-1' }])
const importTable = vi.fn(async (): Promise<ImportTableResponse> => ({
  ok: true,
  tagged: true,
  containsPatientData: true,
  context: {
    mode: 'schema-only',
    tableId: 'table-1',
    rowCount: 3,
    columns: [
      { name: 'age', dtype: 'integer' },
      { name: 'sex', dtype: 'categorical' }
    ],
    syntheticSampleRows: [
      ['900001', 'カテゴリ1'],
      ['900002', 'カテゴリ2']
    ],
    syntheticSampleNote: 'synthetic',
    localFilename: 'table.csv'
  }
}))

describe('SchemaNotebookEntry', () => {
  let root: Root | null = null
  let container: HTMLDivElement | null = null

  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    root = null
    container = null
  })

  it('shows a permanent patient-data badge and no control that removes it', async () => {
    window.api = {
      schemaNotebook: {
        patientDataTags: tags,
        importTable,
        optInCategorical: vi.fn(),
        execute: vi.fn(),
        modelContext: vi.fn()
      }
    } as unknown as Window['api']
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(<SchemaNotebookEntry projectId="study-1" />)
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(container.textContent).toContain('患者データを含む')
    expect(container.textContent).toContain('患者表を分析')
    expect(container.querySelector('[data-patient-data-badge]')?.textContent).toBe(
      '患者データを含む'
    )
    expect(container.textContent).toContain('印を外すことはできません')
    expect(container.querySelector('button[data-remove-patient-data]')).toBeNull()
  })
})
