// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { initI18n } from '../../i18n'
import { createInitialProjectState, useProjectStore } from '@/stores/project-store'
import type {
  ExecuteAnalysisResponse,
  ImportTableResponse
} from '../../../../shared/schema-notebook'
import { SchemaNotebookEntry } from './SchemaNotebookEntry'
import { schemaNotebookCopy } from './copy'
import { schemaNotebookDraftKey } from './schema-notebook-draft'

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
  initI18n('ja')
  let root: Root | null = null
  let container: HTMLDivElement | null = null

  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    root = null
    container = null
    useProjectStore.setState(createInitialProjectState())
    // The draft is stored per project, so a case that imports a table would otherwise leak a
    // stored draft into any later case that uses the same project id.
    localStorage.clear()
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
    expect(container.textContent).toContain('モデルに渡す内容')
    expect(container.textContent).toContain(
      '10 未満のセルはプライバシー保護のため伏せています。手元の Notebook では実数が表示されます。'
    )
    expect(container.textContent).toContain('マスキングチェック')
    expect(container.textContent).toContain('仮名化済み')
    expect(container.textContent).toContain(
      '個々の患者の行（.head()、.tail()、.sample()、1人分の値、行ごとの表示）はモデルに渡しません。'
    )
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
    const execute = vi.fn(async (): Promise<ExecuteAnalysisResponse> => ({
      local: { stdout: 'group,n\nA,4\nB,20', stderr: 'ValueError: n=2', exitCode: 1 },
      forModel: {
        error: 'ValueError: n=<10',
        stdout: 'group,n\nA,<10\nB,20',
        head: 'A,<10',
        table: 'group,n\nA,<10\nB,20'
      },
      interpreter: { source: 'bundled' as const, version: '3.12.15' }
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
    // The panel says which interpreter ran the script, so a PATH fallback is visible.
    expect(container.textContent).toContain(
      schemaNotebookCopy('ja').interpreterBundled.replace('{{version}}', '3.12.15')
    )

    // The fallback wording is the other half of the same contract: it must say the bundled runtime
    // could not start, not that a file is missing.
    execute.mockResolvedValueOnce({
      local: { stdout: 'group,n\nA,4\nB,20', stderr: '', exitCode: 0 },
      forModel: { stdout: 'group,n\nA,4\nB,20', table: 'group,n\nA,4\nB,20' },
      interpreter: { source: 'system' as const, version: '3.13.15' }
    })
    const runAgain = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === schemaNotebookCopy('ja').run
    )
    await act(async () => {
      runAgain?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve(execute.mock.results.at(-1)?.value).catch(() => undefined)
    })
    expect(container.textContent).toContain(
      schemaNotebookCopy('ja').interpreterSystem.replace('{{version}}', '3.13.15')
    )
  })

  it('does not offer an opt-in control for a free-text column', async () => {
    importTable.mockResolvedValueOnce({
      ok: true,
      tagged: true,
      containsPatientData: true,
      identifierWarnings: [],
      context: {
        mode: 'schema-only',
        tableId: 'table-1',
        rowCount: 40,
        columns: [
          { name: 'note', dtype: 'text' },
          { name: 'diagnosis', dtype: 'categorical' }
        ],
        syntheticSampleRows: [['テキスト例1', 'カテゴリ1']],
        syntheticSampleNote: 'synthetic',
        localFilename: 'table.csv'
      }
    })
    const optInCategorical = vi.fn(async () => ({
      mode: 'schema-only' as const,
      tableId: 'table-1',
      rowCount: 40,
      columns: [
        { name: 'note', dtype: 'text' as const },
        { name: 'diagnosis', dtype: 'categorical' as const }
      ],
      syntheticSampleRows: [['テキスト例1', 'カテゴリ1']],
      syntheticSampleNote: 'synthetic',
      localFilename: 'table.csv' as const,
      categoricalValues: { diagnosis: ['dx01'] }
    }))
    window.api = {
      schemaNotebook: {
        patientDataTags: tags,
        importTable,
        optInCategorical,
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
    const file = new File(['note,diagnosis\n経過。,内科'], 'notes.csv', { type: 'text/csv' })
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
    expect(container.textContent).toContain('自由記述の列は選べません')
    expect(container.querySelector('[data-categorical-opt-in="note"]')).toBeNull()
    const diagnosis = container.querySelector(
      '[data-categorical-opt-in="diagnosis"]'
    ) as HTMLInputElement | null
    expect(diagnosis).not.toBeNull()
    expect(diagnosis?.disabled).toBe(false)
    await act(async () => {
      diagnosis?.click()
    })
    expect(optInCategorical).toHaveBeenCalledWith(
      expect.objectContaining({ column: 'diagnosis', projectId: 'study-1', tableId: 'table-1' })
    )
    expect(optInCategorical).not.toHaveBeenCalledWith(expect.objectContaining({ column: 'note' }))
  })

  it('does not offer a patient-table import on a mentor discussion pack', async () => {
    useProjectStore.setState({
      ...createInitialProjectState(),
      isLoaded: true,
      projects: [
        {
          id: 'study-1',
          name: 'Mentor',
          description: '',
          agentContext: 'Package mode: mentor-pack',
          isExample: false,
          createdAt: 1,
          updatedAt: 1
        }
      ]
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(<SchemaNotebookEntry projectId="study-1" />)
    })
    expect(container.querySelector('[data-testid="mentor-pack-no-patient-table"]')).not.toBeNull()
    expect(container.textContent).toContain('このパックは患者データを読み込みません。')
    expect(container.textContent).toContain(
      '患者の個別データを貼り付けないでください。相談は研究デザインと集計結果の要約にとどめてください。'
    )
    expect(container.textContent).not.toContain('患者表を分析')
    expect(container.querySelector('input[type="file"]')).toBeNull()
  })

  it('hides the previous table preview when the next import fails', async () => {
    const copy = schemaNotebookCopy('ja')
    importTable.mockResolvedValueOnce({
      ok: true,
      tagged: true,
      containsPatientData: true,
      identifierWarnings: [],
      context: {
        mode: 'schema-only',
        tableId: 'table-1',
        rowCount: 40,
        columns: [{ name: 'group', dtype: 'categorical' }],
        syntheticSampleRows: [['合成サンプル1']],
        syntheticSampleNote: 'synthetic',
        localFilename: 'table.csv'
      }
    })
    importTable.mockRejectedValueOnce(
      new Error(
        "Error invoking remote method 'schema-notebook:import-table': ApplicationCommandError: Workbook has no worksheets."
      )
    )
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
    const open = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === copy.open
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
      readAsArrayBuffer(file: File): void {
        void file.arrayBuffer().then((buffer) => {
          this.result = buffer
          this.onload?.()
        })
      }
    }
    vi.stubGlobal('FileReader', ImmediateReader)
    const selectFile = async (name: string, body: string): Promise<void> => {
      const input = container!.querySelector('input[type="file"]')
      const file = new File([body], name, { type: 'text/csv' })
      Object.defineProperty(input, 'files', { configurable: true, value: [file] })
      await act(async () => {
        input?.dispatchEvent(new Event('change', { bubbles: true }))
      })
    }
    const importCurrentFile = async (): Promise<void> => {
      const importButton = Array.from(container!.querySelectorAll('button')).find(
        (button) => button.textContent === copy.import
      )
      await act(async () => {
        importButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      await act(async () => {
        await Promise.resolve(importTable.mock.results.at(-1)?.value).catch(() => undefined)
      })
    }
    await selectFile('counts.csv', 'group\nA')
    await importCurrentFile()
    expect(container.textContent).toContain(`${copy.rows}: 40`)
    // With a table on screen there is nothing to recover, so the recovery hint stays away.
    expect(container.textContent).not.toContain(copy.tableStillSaved)

    // A failed import must never discard the user's code; that is the whole point of keeping the
    // editor usable without a table.
    const keepCode = 'print("keep this draft")'
    await act(async () => {
      const textarea = container!.querySelector('textarea') as HTMLTextAreaElement
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(
        textarea,
        keepCode
      )
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect((container.querySelector('textarea') as HTMLTextAreaElement).value).toBe(keepCode)

    await selectFile('broken.xlsx', 'not-an-xlsx')
    await importCurrentFile()
    // The failed file must not leave the previous row count and columns looking current.
    expect(container.textContent).not.toContain(`${copy.rows}: 40`)
    expect(container.textContent).not.toContain('合成サンプル1')
    expect(container.textContent).toContain('Workbook has no worksheets.')
    // The panel shows the main process sentence, not the IPC transport chrome.
    expect(container.textContent).not.toContain('Error invoking remote method')
    // The draft survives the failure, and Run stays unavailable without a table.
    expect((container.querySelector('textarea') as HTMLTextAreaElement).value).toBe(keepCode)
    const runButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === copy.run
    ) as HTMLButtonElement | undefined
    expect(runButton?.disabled).toBe(true)
    // Read the persisted draft too: the DOM value alone can stay correct while React's `code`
    // state is still empty, and the save effect only writes what the state actually holds.
    const stored = localStorage.getItem(schemaNotebookDraftKey('study-1'))
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored as string).code).toBe(keepCode)
    // The file that failed is not the table that was imported earlier, so its reference survives:
    // reopening the project can still restore it.
    expect(JSON.parse(stored as string).tableId).toBe('table-1')
    // Both facts are on screen: why this file failed and what the earlier table can still do.
    expect(container.textContent).toContain(copy.tableStillSaved)
    // The restore notice says the opposite ("could not be restored") and must not appear here.
    expect(container.textContent).not.toContain(copy.restoreNotice)
  })

  it('drops a stale restore notice when a later import fails', async () => {
    const copy = schemaNotebookCopy('ja')
    // Start from the "the stored table is gone" state: its notice is on screen.
    localStorage.setItem(
      schemaNotebookDraftKey('study-1'),
      JSON.stringify({ tableId: 'table-gone', filename: 'table.csv', code: '', language: 'python' })
    )
    const modelContext = vi.fn(async () => {
      throw new Error('table missing')
    })
    window.api = {
      schemaNotebook: {
        patientDataTags: tags,
        importTable,
        optInCategorical: vi.fn(),
        execute: vi.fn(),
        modelContext
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
    const open = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === copy.open
    )
    await act(async () => {
      open?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.textContent).toContain(copy.restoreNotice)
    // No import has failed here, so the hint must not claim the table is recoverable. This is the
    // window a project switch opens (tableId set, context not back yet).
    expect(container.textContent).not.toContain(copy.tableStillSaved)

    importTable.mockRejectedValueOnce(
      new Error(
        "Error invoking remote method 'schema-notebook:import-table': ApplicationCommandError: Workbook has no worksheets."
      )
    )
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
    const file = new File(['not-an-xlsx'], 'broken.xlsx', { type: 'text/csv' })
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
      await Promise.resolve(importTable.mock.results.at(-1)?.value).catch(() => undefined)
    })

    expect(container.textContent).toContain('Workbook has no worksheets.')
    // The old "cannot be restored" notice is gone: the two failures are different.
    expect(container.textContent).not.toContain(copy.restoreNotice)
  })
})
