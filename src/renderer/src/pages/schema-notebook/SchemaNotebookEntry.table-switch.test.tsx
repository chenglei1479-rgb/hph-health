// @vitest-environment jsdom
// Switching tables must drop the previously listed run files (#121 review). The panel used to keep
// table A's outputs while showing table B's schema, so the save button could export A's result as if it
// were B's.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { initI18n } from '../../i18n'
import { createInitialProjectState, useProjectStore } from '@/stores/project-store'
import type { ImportTableResponse, SchemaModelContext } from '../../../../shared/schema-notebook'
import { SchemaNotebookEntry } from './SchemaNotebookEntry'

import { schemaNotebookDraftKey } from './schema-notebook-draft'

// These suites pin the interface language to Japanese, so the panel copy they read is the ja
// catalog. Asserting the ja strings keeps the beta UI byte-identical after the move into the shared
// catalog, and the strong-copy suite guards the other seven languages.
const COPY = {
  open: '患者表を分析',
  import: 'ファイルを取り込む',
  rows: '行数',
  run: '手元で実行',
  tableStillSaved:
    '前回取り込んだ表は保存されています。別のプロジェクトに切り替えてから、このプロジェクトに戻ると復元できます。',
  restoreNotice:
    '前回取り込んだ表を復元できませんでした。ファイルを選び直してください。手元のコードはそのまま残しています。',
  interpreterBundled: '実行環境: 同梱の Python {{version}}（オフライン）',
  interpreterSystem: '実行環境: システムの Python {{version}}（同梱ランタイムを起動できませんでした）'
}

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const tableA: SchemaModelContext = {
  mode: 'schema-only',
  tableId: 'table-a',
  rowCount: 40,
  columns: [{ name: 'age', dtype: 'integer' }],
  syntheticSampleRows: [['900001']],
  syntheticSampleNote: 'synthetic',
  localFilename: 'table.csv'
}
const tableB: SchemaModelContext = { ...tableA, tableId: 'table-b', rowCount: 7 }

const tags = vi.fn(async () => [])
const importTable = vi.fn(
  async (): Promise<ImportTableResponse> => ({
    ok: true,
    tagged: false,
    containsPatientData: false,
    identifierWarnings: [],
    context: tableB
  })
)
const lastRun = vi.fn(async ({ tableId }: { tableId: string }) =>
  tableId === 'table-a'
    ? {
        runId: 'run-a',
        outputs: [
          { relativePath: 'plot.png', sizeBytes: 12_779, sha256: 'a'.repeat(64), mimeType: 'image/png' }
        ]
      }
    : null
)

describe('SchemaNotebookEntry table switch', () => {
  initI18n('ja')
  let root: Root | null = null
  let container: HTMLDivElement | null = null

  beforeEach(() => {
    localStorage.clear()
    useProjectStore.setState(createInitialProjectState())
  })

  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    root = null
    container = null
    localStorage.clear()
    useProjectStore.setState(createInitialProjectState())
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('drops the previous table files when a different table is imported', async () => {
    const copy = COPY
    localStorage.setItem(
      schemaNotebookDraftKey('study-1'),
      JSON.stringify({ tableId: 'table-a', filename: 'a.csv', code: 'print(1)', language: 'python' })
    )
    window.api = {
      schemaNotebook: {
        patientDataTags: tags,
        importTable,
        optInCategorical: vi.fn(),
        execute: vi.fn(),
        modelContext: vi.fn(async () => tableA),
        lastRun,
        saveOutput: vi.fn(async () => ({ saved: true }))
      }
    } as unknown as Window['api']
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(<SchemaNotebookEntry projectId="study-1" />)
    })
    await act(async () => {
      await Promise.resolve(lastRun.mock.results.at(-1)?.value)
    })
    const open = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === copy.open
    )
    await act(async () => {
      open?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Table A is open, so its run's file is listed.
    expect(container.querySelectorAll('[data-testid="schema-notebook-output"]')).toHaveLength(1)

    class ImmediateReader {
      result: string | ArrayBuffer | null = null
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      readAsText(file: File): void {
        void file.text().then((text) => {
          this.result = text
          this.onload?.()
        })
      }
      readAsArrayBuffer(file: File): void {
        void file.arrayBuffer().then((buffer) => {
          this.result = buffer
          this.onload?.()
        })
      }
    }
    vi.stubGlobal('FileReader', ImmediateReader)
    const input = container.querySelector('input[type="file"]')
    const file = new File(['age\n1'], 'b.csv', { type: 'text/csv' })
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    await act(async () => {
      input?.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const importButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === copy.import
    )
    await act(async () => {
      importButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve(importTable.mock.results.at(-1)?.value)
    })
    await act(async () => {
      await Promise.resolve(lastRun.mock.results.at(-1)?.value)
    })

    // Table B has no runs, so nothing from table A may remain on screen.
    expect(lastRun).toHaveBeenLastCalledWith({ projectId: 'study-1', tableId: 'table-b' })
    expect(container.querySelectorAll('[data-testid="schema-notebook-output"]')).toHaveLength(0)
  })
})
