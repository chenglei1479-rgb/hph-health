// @vitest-environment jsdom

import { act } from 'react'
import { fireEvent } from '@testing-library/react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { initI18n } from '../../i18n'
import { createInitialProjectState, useProjectStore } from '@/stores/project-store'
import type { SchemaModelContext } from '../../../../shared/schema-notebook'
import { SchemaNotebookEntry } from './SchemaNotebookEntry'
import {
  SCHEMA_NOTEBOOK_DEFAULT_CODE,
  loadSchemaNotebookDraft,
  saveSchemaNotebookDraft
} from './schema-notebook-draft'

const context: SchemaModelContext = {
  mode: 'schema-only',
  tableId: 'table-1',
  rowCount: 3,
  columns: [
    { name: 'age', dtype: 'integer' },
    { name: 'sex', dtype: 'categorical' }
  ],
  syntheticSampleRows: [['900001', 'カテゴリ1']],
  syntheticSampleNote: 'synthetic',
  categoricalValues: {}
} as unknown as SchemaModelContext

const execute = vi.fn(async () => ({ local: { stdout: 'done' }, forModel: {} }))
const importTable = vi.fn(async () => ({
  ok: true as const,
  tagged: false,
  containsPatientData: false,
  identifierWarnings: [],
  context
}))
const modelContext = vi.fn(async () => context)
const patientDataTags = vi.fn(async () => [])

let root: Root | null = null
let container: HTMLDivElement | null = null

const mount = async (projectId: string): Promise<void> => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(<SchemaNotebookEntry projectId={projectId} />)
  })
  await act(async () => {
    await Promise.resolve()
  })
}

const unmount = async (): Promise<void> => {
  if (root) await act(async () => root?.unmount())
  container?.remove()
  root = null
  container = null
}

const rerenderAs = async (projectId: string): Promise<void> => {
  await act(async () => {
    root?.render(<SchemaNotebookEntry projectId={projectId} />)
  })
  await act(async () => {
    await Promise.resolve()
  })
}

const clickText = async (label: string): Promise<void> => {
  const button = Array.from(container?.querySelectorAll('button') ?? []).find(
    (candidate) => candidate.textContent === label
  )
  expect(button).toBeTruthy()
  await act(async () => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

const importCsv = async (): Promise<void> => {
  const input = container?.querySelector<HTMLInputElement>('input[type="file"]')
  const file = new File(['group,n\nA,4'], 'counts.csv', { type: 'text/csv' })
  Object.defineProperty(input!, 'files', { configurable: true, value: [file] })
  await act(async () => {
    input?.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await clickText('ファイルを取り込む')
  await act(async () => {
    await Promise.resolve()
  })
}

const setCode = async (value: string): Promise<void> => {
  const area = container?.querySelector<HTMLTextAreaElement>('textarea')
  if (!area) throw new Error('code area missing')
  await act(async () => {
    fireEvent.change(area, { target: { value } })
  })
  expect(area.value).toBe(value)
}

beforeEach(() => {
  initI18n('ja')
  localStorage.clear()
  execute.mockClear()
  importTable.mockClear()
  modelContext.mockClear()
  patientDataTags.mockClear()
  modelContext.mockResolvedValue(context)
  useProjectStore.setState({
    ...createInitialProjectState(),
    projects: [
      {
        id: 'study-1',
        name: 'Study 1',
        description: '',
        isExample: false,
        agentContext: 'Workflow mode: analysis',
        createdAt: 1,
        updatedAt: 1
      },
      {
        id: 'study-2',
        name: 'Study 2',
        description: '',
        isExample: false,
        agentContext: 'Workflow mode: analysis',
        createdAt: 1,
        updatedAt: 1
      }
    ],
    isLoaded: true
  })
  window.api = {
    schemaNotebook: {
      patientDataTags,
      importTable,
      optInCategorical: vi.fn(),
      execute,
      modelContext
    }
  } as unknown as Window['api']
})

afterEach(async () => {
  await unmount()
  useProjectStore.setState(createInitialProjectState())
})

describe('schema notebook panel restore', () => {
  it('restores the imported table and the hand-written code after leaving the project', async () => {
    await mount('study-1')
    await clickText('患者表を分析')
    await importCsv()
    await setCode('print(df.columns)')
    await unmount()
    expect(loadSchemaNotebookDraft('study-1').code).toBe('print(df.columns)')

    await mount('study-1')
    await act(async () => {
      await Promise.resolve()
    })
    await clickText('患者表を分析')

    expect(modelContext).toHaveBeenCalledWith({ projectId: 'study-1', tableId: 'table-1' })
    expect(container?.textContent).toContain('行数: 3')
    await clickText('手元で実行')
    expect(execute).toHaveBeenCalledWith({
      projectId: 'study-1',
      tableId: 'table-1',
      language: 'python',
      code: 'print(df.columns)'
    })
  })

  it('keeps projects apart', async () => {
    saveSchemaNotebookDraft('study-1', {
      tableId: 'table-1',
      filename: 'counts.csv',
      code: 'print("study 1")',
      language: 'python'
    })

    await mount('study-2')
    await clickText('患者表を分析')

    expect(modelContext).not.toHaveBeenCalled()
    expect(container?.querySelector('textarea')?.value).toBe(SCHEMA_NOTEBOOK_DEFAULT_CODE)
  })

  it('asks for the file again when the stored table cannot be reopened', async () => {
    saveSchemaNotebookDraft('study-1', {
      tableId: 'table-gone',
      filename: 'counts.csv',
      code: 'print(df.head())',
      language: 'python'
    })
    modelContext.mockRejectedValueOnce(new Error('table missing'))

    await mount('study-1')
    await act(async () => {
      await Promise.resolve()
    })
    await clickText('患者表を分析')

    expect(
      container?.querySelector('[data-testid="schema-notebook-restore-notice"]')
    ).not.toBeNull()
    expect(container?.textContent).toContain('ファイルを選び直してください')
    // The user's code stays; it simply is not attached to any table any more.
    expect(container?.querySelector('textarea')?.value).toBe('print(df.head())')
    expect(container?.textContent).not.toContain('行数: 3')
  })

  it('does not write the previous project draft into the next project on a switch', async () => {
    await mount('study-1')
    await clickText('患者表を分析')
    await importCsv()
    await setCode('print("study 1")')

    await rerenderAs('study-2')

    const next = loadSchemaNotebookDraft('study-2')
    expect(next.code).toBe(SCHEMA_NOTEBOOK_DEFAULT_CODE)
    expect(next.tableId).toBeUndefined()
    expect(container?.querySelector('textarea')?.value).toBe(SCHEMA_NOTEBOOK_DEFAULT_CODE)
  })
})
