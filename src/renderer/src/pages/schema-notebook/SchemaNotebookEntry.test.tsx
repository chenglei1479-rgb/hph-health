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
  identifierWarnings: [],
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
    vi.unstubAllGlobals()
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
    const open = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === '患者表を分析'
    )
    await act(async () => {
      open?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.textContent).toContain('マスキングチェック')
    expect(container.textContent).toContain('仮名化済み')
    expect(container.textContent).not.toContain('匿名化')
  })

  it('shows true local counts and masks only the model copy', async () => {
    importTable.mockResolvedValueOnce({
      ok: true,
      tagged: true,
      containsPatientData: true,
      identifierWarnings: [
        {
          column: 'カルテ番号',
          category: 'KARTE_NO',
          message:
            'この列は AI には送信されません。院外にデータを渡す前に、この列を削除してください。'
        }
      ],
      context: {
        mode: 'schema-only',
        tableId: 'table-1',
        rowCount: 3,
        columns: [{ name: 'group', dtype: 'categorical' }],
        syntheticSampleRows: [['カテゴリ1']],
        syntheticSampleNote: 'synthetic',
        localFilename: 'table.csv'
      }
    })
    const execute = vi.fn(async () => ({
      local: { stdout: 'group,n\nA,4\nB,20', stderr: 'ValueError: n=2', exitCode: 1 },
      forModel: {
        error: 'ValueError: n=<10',
        stdout: 'group,n\nA,<10\nB,20',
        head: 'A,<10',
        table: 'group,n\nA,<10\nB,20'
      }
    }))
    window.api = {
      schemaNotebook: {
        patientDataTags: tags,
        importTable,
        optInCategorical: vi.fn(),
        execute,
        modelContext: vi.fn()
      }
    } as unknown as Window['api']
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(<SchemaNotebookEntry projectId="study-1" />)
    })
    const open = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === '患者表を分析'
    )
    await act(async () => {
      open?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
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
      readAsArrayBuffer(): void {
        this.onerror?.()
      }
    }
    vi.stubGlobal('FileReader', ImmediateReader)
    const input = container.querySelector('input[type="file"]')
    const file = new File(['group,n\nA,4'], 'counts.csv', { type: 'text/csv' })
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    await act(async () => {
      input?.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const importButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'ファイルを取り込む'
    )
    await act(async () => {
      importButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      await importTable.mock.results.at(-1)?.value
    })
    const run = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === '手元で実行'
    )
    await act(async () => {
      run?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      await execute.mock.results[0]?.value
    })
    const local = container.querySelector('[aria-label="手元の結果"]')
    const masked = container.querySelector('[aria-label="マスキングチェック"]')
    expect(container.textContent).toContain(
      'この列は AI には送信されません。院外にデータを渡す前に、この列を削除してください。'
    )
    expect(local?.textContent).toContain('A,4')
    expect(local?.textContent).not.toContain('<10')
    expect(masked?.textContent).toContain('A,<10')
    expect(masked?.textContent).toContain('n=<10')
  })
})
