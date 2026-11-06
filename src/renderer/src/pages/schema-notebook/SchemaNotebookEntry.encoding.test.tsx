// @vitest-environment jsdom

import { act } from 'react'
import { fireEvent } from '@testing-library/react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { initI18n } from '../../i18n'
import { createInitialProjectState, useProjectStore } from '@/stores/project-store'
import type { SchemaModelContext } from '../../../../shared/schema-notebook'
import { SchemaNotebookEntry } from './SchemaNotebookEntry'

// #158: the last hop. The main process now hands the panel the characters Python printed; this pins
// that the panel puts that string into the DOM unchanged, so a renderer-side transform cannot turn a
// fixed run back into mojibake, and the trailing newline a `print` produces is not trimmed either.
const PRINTED = '日本語出力確認：架空研究\n'

const context: SchemaModelContext = {
  mode: 'schema-only',
  tableId: 'table-1',
  rowCount: 3,
  columns: [{ name: 'age', dtype: 'integer' }],
  syntheticSampleRows: [['900001']],
  syntheticSampleNote: 'synthetic',
  categoricalValues: {}
} as unknown as SchemaModelContext

const execute = vi.fn()
const importTable = vi.fn(async () => ({
  ok: true as const,
  tagged: false,
  containsPatientData: false,
  identifierWarnings: [],
  context
}))
const modelContext = vi.fn(async () => context)

let root: Root | null = null
let container: HTMLDivElement | null = null

const clickText = async (label: string): Promise<void> => {
  const button = Array.from(container?.querySelectorAll('button') ?? []).find(
    (candidate) => candidate.textContent === label
  )
  expect(button).toBeTruthy()
  await act(async () => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

beforeEach(() => {
  initI18n('ja')
  localStorage.clear()
  execute.mockReset()
  execute.mockResolvedValue({
    local: { stdout: PRINTED, stderr: '', exitCode: 0, outputs: [] },
    forModel: { stdout: PRINTED },
    runId: 'run-encoding'
  })
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
      }
    ],
    isLoaded: true
  })
  window.api = {
    schemaNotebook: {
      patientDataTags: vi.fn(async () => []),
      importTable,
      optInCategorical: vi.fn(),
      execute,
      modelContext
    }
  } as unknown as Window['api']
})

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  container?.remove()
  root = null
  container = null
  useProjectStore.setState(createInitialProjectState())
})

describe('schema notebook panel renders a Japanese result verbatim', () => {
  it('puts the characters Python printed into the result block unchanged', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(<SchemaNotebookEntry projectId="study-1" />)
    })
    await act(async () => {
      await Promise.resolve()
    })

    await clickText('患者表を分析')
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    const file = new File(['group,n\nA,4'], 'counts.csv', { type: 'text/csv' })
    Object.defineProperty(input!, 'files', { configurable: true, value: [file] })
    await act(async () => {
      input?.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await clickText('ファイルを取り込む')
    await act(async () => {
      await Promise.resolve()
    })

    const area = container.querySelector<HTMLTextAreaElement>('textarea')
    await act(async () => {
      fireEvent.change(area!, { target: { value: "print('日本語出力確認：架空研究')" } })
    })
    await clickText('手元で実行')
    await act(async () => {
      await Promise.resolve()
    })

    const result = container.querySelector('[aria-label="手元の結果"]')
    expect(result?.textContent).toBe(PRINTED)
    expect(result?.textContent).not.toContain('\ufffd')
  })
})
