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

const tags = vi.fn(async () => [{ projectId: 'study-1' }])
const importTable = vi.fn(async (..._request: unknown[]): Promise<ImportTableResponse> => ({
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
      local: {
        stdout: 'group,n\nA,4\nB,20',
        stderr: 'ValueError: n=2',
        exitCode: 1,
        outputs: []
      },
      forModel: {
        error: 'ValueError: n=<10',
        stdout: 'group,n\nA,<10\nB,20',
        head: 'A,<10',
        table: 'group,n\nA,<10\nB,20'
      },
      interpreter: { source: 'bundled' as const, version: '3.12.15' },
      runId: 'run-1'
    }))
    window.api = {
      schemaNotebook: {
        patientDataTags: tags,
        importTable,
        optInCategorical: vi.fn(),
        execute,
        modelContext: vi.fn(),
        lastRun: vi.fn(async () => null),
        saveOutput: vi.fn(async () => ({ saved: true }))
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
      readAsArrayBuffer(file: File): void {
        void file.arrayBuffer().then((buffer) => {
          this.result = buffer
          this.onload?.()
        })
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
    // The panel hands the file over as bytes. Passing decoded text would move decoding back into the
    // renderer, which reads every file as UTF-8 — the hole that hid CP932 headers from the scans.
    const importedRequest = importTable.mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(typeof importedRequest.csvBase64).toBe('string')
    expect(importedRequest).not.toHaveProperty('csvText')
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
      COPY.interpreterBundled.replace('{{version}}', '3.12.15')
    )

    // The fallback wording is the other half of the same contract: it must say the bundled runtime
    // could not start, not that a file is missing.
    execute.mockResolvedValueOnce({
      local: { stdout: 'group,n\nA,4\nB,20', stderr: '', exitCode: 0, outputs: [] },
      forModel: { stdout: 'group,n\nA,4\nB,20', table: 'group,n\nA,4\nB,20' },
      interpreter: { source: 'system' as const, version: '3.13.15' },
      runId: 'run-2'
    })
    const runAgain = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === COPY.run
    )
    await act(async () => {
      runAgain?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve(execute.mock.results.at(-1)?.value).catch(() => undefined)
    })
    expect(container.textContent).toContain(
      COPY.interpreterSystem.replace('{{version}}', '3.13.15')
    )
  })

  it('shows the main-process sentence when the shipped interpreter cannot start', async () => {
    importTable.mockResolvedValueOnce({
      ok: true,
      tagged: true,
      containsPatientData: true,
      identifierWarnings: [],
      context: {
        mode: 'schema-only',
        tableId: 'table-1',
        rowCount: 3,
        columns: [{ name: 'age', dtype: 'integer' }],
        syntheticSampleRows: [['900001']],
        syntheticSampleNote: 'synthetic',
        localFilename: 'table.csv'
      }
    })
    // This channel is a direct ipcMainHandle, so the rejection carries no code: the main process
    // localizes the sentence and throws a plain Error, which Electron wraps. The panel must show that
    // sentence and nothing of the wrapper, or the user reads English chrome in a Japanese panel.
    const localized =
      '同梱の Python 実行環境を起動できませんでした。解析は実行していません。アプリを再インストールしてください。（コード: schema-notebook-python-unavailable）'
    const execute = vi.fn(async (): Promise<ExecuteAnalysisResponse> => {
      throw new Error(`Error invoking remote method 'schema-notebook:execute': Error: ${localized}`)
    })
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
    await act(async () => {
      await Promise.resolve()
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
      readAsArrayBuffer(file: File): void {
        void file.arrayBuffer().then((buffer) => {
          this.result = buffer
          this.onload?.()
        })
      }
    }
    vi.stubGlobal('FileReader', ImmediateReader)
    const input = container.querySelector('input[type="file"]')
    const file = new File(['age\n30'], 'ages.csv', { type: 'text/csv' })
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
      await Promise.resolve(execute.mock.results.at(-1)?.value).catch(() => undefined)
    })

    expect(execute).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain(localized)
    expect(container.textContent).not.toContain('Error invoking remote method')
    expect(container.textContent).not.toContain('schema-notebook:execute')
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
      readAsArrayBuffer(file: File): void {
        void file.arrayBuffer().then((buffer) => {
          this.result = buffer
          this.onload?.()
        })
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
    const copy = COPY
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
    // #167: the reader's language, not the main process sentence verbatim. Before this change a
    // Japanese interface showed the English sentence at the moment the doctor needed to act.
    expect(container.textContent).toContain('このブックにはワークシートがありません。')
    expect(container.textContent).not.toContain('Workbook has no worksheets.')
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
    const copy = COPY
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

    expect(container.textContent).toContain('このブックにはワークシートがありません。')
    // The old "cannot be restored" notice is gone: the two failures are different.
    expect(container.textContent).not.toContain(copy.restoreNotice)
  })

  it('lists the files a run kept and saves a copy of one', async () => {
    const copy = COPY
    const saveOutput = vi.fn(async () => ({ saved: true }))
    const lastRun = vi.fn(async () => ({
      runId: 'run-restored',
      outputs: [
        { relativePath: 'plot.png', sizeBytes: 12_779, sha256: 'a'.repeat(64), mimeType: 'image/png' }
      ]
    }))
    const execute = vi.fn(async (): Promise<ExecuteAnalysisResponse> => ({
      local: {
        stdout: '3',
        stderr: '',
        exitCode: 0,
        outputs: [
          {
            relativePath: 'plot.png',
            sizeBytes: 12_779,
            sha256: 'a'.repeat(64),
            mimeType: 'image/png'
          },
          {
            relativePath: 'figures/nested.svg',
            sizeBytes: 21_219,
            sha256: 'b'.repeat(64),
            mimeType: 'image/svg+xml'
          }
        ]
      },
      forModel: { stdout: '3' },
      runId: 'run-1'
    }))
    // A stored draft means the panel reopens the project with the table it had, which is also the path
    // that must show the previous run's figures again after a restart.
    localStorage.setItem(
      schemaNotebookDraftKey('study-1'),
      JSON.stringify({ tableId: 'table-1', filename: 'study.csv', code: 'print(1)', language: 'python' })
    )
    window.api = {
      schemaNotebook: {
        patientDataTags: tags,
        importTable,
        optInCategorical: vi.fn(),
        execute,
        modelContext: vi.fn(async () => ({
          mode: 'schema-only' as const,
          tableId: 'table-1',
          rowCount: 3,
          columns: [{ name: 'age', dtype: 'integer' as const }],
          syntheticSampleRows: [['900001']],
          syntheticSampleNote: 'synthetic',
          localFilename: 'table.csv' as const
        })),
        lastRun,
        saveOutput
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
    await act(async () => {
      await Promise.resolve(lastRun.mock.results.at(-1)?.value)
    })

    // Reopened project: the previous run's file is listed before anything runs in this session.
    expect(lastRun).toHaveBeenCalledWith({ projectId: 'study-1', tableId: 'table-1' })
    const restored = container.querySelectorAll('[data-testid="schema-notebook-output"]')
    expect(restored).toHaveLength(1)
    expect(restored[0]?.textContent).toContain('plot.png')
    expect(restored[0]?.textContent).toContain('12 KB')

    // A new run replaces the list with what it kept, including a nested file.
    const run = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === copy.run
    )
    await act(async () => {
      run?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve(execute.mock.results.at(-1)?.value)
    })
    const rows = container.querySelectorAll('[data-testid="schema-notebook-output"]')
    expect(rows).toHaveLength(2)
    expect(container.textContent).toContain('figures/nested.svg')
    expect(container.textContent).toContain('21 KB')

    const saveButtons = Array.from(container.querySelectorAll('button')).filter(
      (button) => button.textContent === 'コピーを保存'
    )
    await act(async () => {
      saveButtons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve(saveOutput.mock.results.at(-1)?.value)
    })
    // The copy is saved against THIS run, not the restored one.
    expect(saveOutput).toHaveBeenCalledWith({
      projectId: 'study-1',
      runId: 'run-1',
      relativePath: 'plot.png'
    })
    expect(container.textContent).toContain('保存しました。')
  })

  it('shows the main-process sentence when a saved copy cannot be produced', async () => {
    const copy = COPY
    const lastRun = vi.fn(async () => ({
      runId: 'run-restored',
      outputs: [
        { relativePath: 'plot.png', sizeBytes: 12, sha256: 'c'.repeat(64), mimeType: 'image/png' }
      ]
    }))
    const saveOutput = vi.fn(async () => {
      throw new Error(
        "Error invoking remote method 'schema-notebook:save-output': Error: The output files from that run are missing or changed, so the file was not saved. Run the analysis again. (Code: schema-notebook-run-output-missing)"
      )
    })
    localStorage.setItem(
      schemaNotebookDraftKey('study-1'),
      JSON.stringify({ tableId: 'table-1', filename: 'study.csv', code: 'print(1)', language: 'python' })
    )
    window.api = {
      schemaNotebook: {
        patientDataTags: tags,
        importTable,
        optInCategorical: vi.fn(),
        execute: vi.fn(),
        modelContext: vi.fn(async () => ({
          mode: 'schema-only' as const,
          tableId: 'table-1',
          rowCount: 3,
          columns: [{ name: 'age', dtype: 'integer' as const }],
          syntheticSampleRows: [['900001']],
          syntheticSampleNote: 'synthetic',
          localFilename: 'table.csv' as const
        })),
        lastRun,
        saveOutput
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
    await act(async () => {
      await Promise.resolve(lastRun.mock.results.at(-1)?.value)
    })
    const saveButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'コピーを保存'
    )
    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve(saveOutput.mock.results.at(-1)?.value).catch(() => undefined)
    })

    // The IPC transport chrome is stripped and the main-process sentence is shown as-is.
    const error = container.querySelector('[data-testid="schema-notebook-output-error"]')
    expect(error?.textContent).toContain('Run the analysis again.')
    expect(error?.textContent).toContain('schema-notebook-run-output-missing')
    expect(error?.textContent).not.toContain('Error invoking remote method')
  })

  it('keeps the last run figures listed when the stored table can no longer be reopened', async () => {
    const copy = COPY
    const saveOutput = vi.fn(async () => ({ saved: true }))
    const lastRun = vi.fn(async () => ({
      runId: 'run-before-loss',
      outputs: [
        {
          relativePath: 'plot.png',
          sizeBytes: 12_779,
          sha256: 'd'.repeat(64),
          mimeType: 'image/png'
        }
      ]
    }))
    localStorage.setItem(
      schemaNotebookDraftKey('study-1'),
      JSON.stringify({ tableId: 'table-1', filename: 'study.csv', code: 'print(1)', language: 'python' })
    )
    // The table csv is gone, so the panel cannot restore the table at all.
    const modelContext = vi.fn(async () => {
      throw new Error(
        'Error invoking remote method \'schema-notebook:model-context\': Error: The imported table file is missing or unreadable. Nothing was run.'
      )
    })
    window.api = {
      schemaNotebook: {
        patientDataTags: tags,
        importTable,
        optInCategorical: vi.fn(),
        execute: vi.fn(),
        modelContext,
        lastRun,
        saveOutput
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
    await act(async () => {
      await Promise.resolve(modelContext.mock.results.at(-1)?.value).catch(() => undefined)
    })
    const open = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === copy.open
    )
    await act(async () => {
      open?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // The table must not look restored...
    expect(container.textContent).toContain(copy.restoreNotice)
    // ...but the figures from the last run are still on disk and still listed.
    const rows = container.querySelectorAll('[data-testid="schema-notebook-output"]')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.textContent).toContain('plot.png')

    // The draft keeps the run source even though the restore cleared the table reference, so the next
    // mount still finds the record instead of losing the figures from the UI for good.
    const stored = JSON.parse(localStorage.getItem(schemaNotebookDraftKey('study-1')) ?? '{}') as {
      tableId?: string
      lastRunTableId?: string
    }
    expect(stored.tableId).toBeUndefined()
    expect(stored.lastRunTableId).toBe('table-1')

    const saveButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'コピーを保存'
    )
    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve(saveOutput.mock.results.at(-1)?.value)
    })
    expect(saveOutput).toHaveBeenCalledWith({
      projectId: 'study-1',
      runId: 'run-before-loss',
      relativePath: 'plot.png'
    })
  })

  // #162: after a restart the panel restored the code and the figures but lost the result itself, so a
  // doctor had to re-run to prove it existed. The stored record now carries the output; it must appear
  // without running anything, and it must be labelled as history rather than as this session's result.
  it('shows the last run output after a restart without re-running, labelled as history', async () => {
    const copy = COPY
    const execute = vi.fn()
    const lastRun = vi.fn(async () => ({
      schemaVersion: 2 as const,
      runId: 'run-saved',
      projectId: 'study-1',
      tableId: 'table-1',
      language: 'python' as const,
      startedAt: '2026-11-06T02:04:47.722Z',
      endedAt: '2026-11-06T02:04:59.084Z',
      exitCode: 1,
      code: 'print(1)',
      inputSha256: 'a'.repeat(64),
      stdout: 'marker: beta21\nHR 0.62 (95% CI 0.41-0.93)',
      stderr: 'ValueError: boom',
      outputs: []
    }))
    localStorage.setItem(
      schemaNotebookDraftKey('study-1'),
      JSON.stringify({ tableId: 'table-1', filename: 'study.csv', code: 'print(1)', language: 'python' })
    )
    window.api = {
      schemaNotebook: {
        patientDataTags: tags,
        importTable,
        optInCategorical: vi.fn(),
        execute,
        modelContext: vi.fn(async () => ({
          mode: 'schema-only' as const,
          tableId: 'table-1',
          rowCount: 3,
          columns: [{ name: 'age', dtype: 'integer' as const }],
          syntheticSampleRows: [['900001']],
          syntheticSampleNote: 'synthetic',
          localFilename: 'table.csv' as const
        })),
        lastRun
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

    // The whole point of the ticket: the result is on screen with no execution at all.
    expect(execute).not.toHaveBeenCalled()
    const history = container.querySelector('[data-testid="schema-notebook-previous-run"]')
    expect(history?.textContent).toContain('marker: beta21')
    expect(history?.textContent).toContain('HR 0.62 (95% CI 0.41-0.93)')
    // Labelled as the stored run, so the doctor cannot read it as a fresh one.
    expect(history?.textContent).toContain('前回の実行')
    expect(history?.textContent).toContain('今回の実行結果ではありません')
    // A failed run keeps its error text and its exit status, so the failure is not turned into a success.
    expect(history?.textContent).toContain('エラー出力')
    expect(history?.textContent).toContain('ValueError: boom')
    expect(history?.textContent).toContain('終了コード 1')
    // The current-run block stays absent: history never borrows its label.
    expect(container.querySelector('[aria-label="手元の結果"]')).toBeNull()
  })

  it('notes that the stored result belongs to older code, and replaces it once the editor runs', async () => {
    const copy = COPY
    const execute = vi.fn(async (): Promise<ExecuteAnalysisResponse> => ({
      local: { stdout: 'NEW-RESULT', stderr: '', exitCode: 0, outputs: [] },
      forModel: {},
      runId: 'run-new'
    }))
    const lastRun = vi.fn(async () => ({
      schemaVersion: 2 as const,
      runId: 'run-old',
      projectId: 'study-1',
      tableId: 'table-1',
      language: 'python' as const,
      startedAt: '2026-11-06T02:04:47.722Z',
      endedAt: '2026-11-06T02:04:59.084Z',
      exitCode: 0,
      code: 'print("old")',
      inputSha256: 'b'.repeat(64),
      stdout: 'OLD-RESULT',
      stderr: '',
      outputs: []
    }))
    localStorage.setItem(
      schemaNotebookDraftKey('study-1'),
      JSON.stringify({
        tableId: 'table-1',
        filename: 'study.csv',
        code: 'print("new")',
        language: 'python'
      })
    )
    window.api = {
      schemaNotebook: {
        patientDataTags: tags,
        importTable,
        optInCategorical: vi.fn(),
        execute,
        modelContext: vi.fn(async () => ({
          mode: 'schema-only' as const,
          tableId: 'table-1',
          rowCount: 3,
          columns: [{ name: 'age', dtype: 'integer' as const }],
          syntheticSampleRows: [['900001']],
          syntheticSampleNote: 'synthetic',
          localFilename: 'table.csv' as const
        })),
        lastRun
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

    expect(container.textContent).toContain('OLD-RESULT')
    // The stored result was produced by other code than the editor now holds; saying so is what keeps
    // "the result is still there" from becoming "this result is yours".
    expect(
      container.querySelector('[data-testid="schema-notebook-previous-run-code-changed"]')?.textContent
    ).toBe('あの実行からコードが変わっています。この結果は以前のコードのものです。')

    const run = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === copy.run
    )
    await act(async () => {
      run?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      await execute.mock.results.at(-1)?.value
    })

    // A run in this session replaces the historical block instead of sitting next to it.
    expect(execute).toHaveBeenCalledWith({
      projectId: 'study-1',
      tableId: 'table-1',
      language: 'python',
      code: 'print("new")'
    })
    expect(container.querySelector('[data-testid="schema-notebook-previous-run"]')).toBeNull()
    expect(container.textContent).toContain('NEW-RESULT')
    expect(container.textContent).not.toContain('OLD-RESULT')
  })

  it('does not invent a stored output for a run recorded before output was stored', async () => {
    const copy = COPY
    const execute = vi.fn()
    // A beta.21 record: the file list exists, the text was never written. The panel must show the history
    // block only when there is text, or an upgrade would present an empty result as a restored one.
    const lastRun = vi.fn(async () => ({
      schemaVersion: 1 as const,
      runId: 'run-v1',
      projectId: 'study-1',
      tableId: 'table-1',
      language: 'python' as const,
      startedAt: '2026-11-06T03:08:09.633Z',
      endedAt: '2026-11-06T03:08:47.236Z',
      exitCode: 0,
      outputs: []
    }))
    localStorage.setItem(
      schemaNotebookDraftKey('study-1'),
      JSON.stringify({ tableId: 'table-1', filename: 'study.csv', code: 'print(1)', language: 'python' })
    )
    window.api = {
      schemaNotebook: {
        patientDataTags: tags,
        importTable,
        optInCategorical: vi.fn(),
        execute,
        modelContext: vi.fn(async () => ({
          mode: 'schema-only' as const,
          tableId: 'table-1',
          rowCount: 3,
          columns: [{ name: 'age', dtype: 'integer' as const }],
          syntheticSampleRows: [['900001']],
          syntheticSampleNote: 'synthetic',
          localFilename: 'table.csv' as const
        })),
        lastRun
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

    expect(container.querySelector('[data-testid="schema-notebook-previous-run"]')).toBeNull()
    expect(execute).not.toHaveBeenCalled()
  })
})
