import { expect, it, vi } from 'vitest'

import { configureTestElectronHost } from '../../../../test/runtime-host'

const { ipcHandlers } = vi.hoisted(() => ({
  ipcHandlers: new Map<string, (...args: unknown[]) => unknown>()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      ipcHandlers.set(channel, handler)
  }
}))

import { ApplicationCommandError } from '../../../shared/application-command-contract'
import {
  SCHEMA_NOTEBOOK_PYTHON_UNAVAILABLE_CODE,
  SCHEMA_NOTEBOOK_TABLE_MISSING_CODE
} from '../../../shared/schema-notebook'
import { registerSchemaNotebookIpc } from './ipc'
import type { SchemaNotebookService } from './service'

// Returns the English key with its code filled in, which is what an untranslated locale sees. The
// assertions compare against that, not against the message the service threw.
const translate = (key: string, options?: Record<string, string | number>): string =>
  key.replace('{{code}}', String(options?.code ?? ''))

const executeRequest = {
  projectId: 'study-1',
  tableId: 'table-1',
  language: 'python' as const,
  code: 'print(1)'
}

const register = (execute: () => Promise<never>): void => {
  ipcHandlers.clear()
  const service = {
    execute,
    importTable: vi.fn(),
    optInCategorical: vi.fn(),
    modelContext: vi.fn(),
    patientDataTags: vi.fn()
  } as unknown as SchemaNotebookService
  registerSchemaNotebookIpc(
    { directory: '/data', approvalLogPath: '/data/approval.jsonl', translate },
    service
  )
}

const rejection = async (): Promise<unknown> => {
  const handler = ipcHandlers.get('schema-notebook:execute')
  expect(handler).toBeTypeOf('function')
  return (handler?.(undefined, executeRequest) as Promise<unknown>).catch((error: unknown) => error)
}

it('replaces the coded interpreter failure with an operable sentence and its code', async () => {
  const original =
    'The bundled Python runtime could not start, so the analysis was not run. Reinstall the app.'
  register(() =>
    Promise.reject(new ApplicationCommandError(SCHEMA_NOTEBOOK_PYTHON_UNAVAILABLE_CODE, original))
  )

  const error = await rejection()

  expect(error).toBeInstanceOf(Error)
  const message = (error as Error).message
  // The panel shows this text as-is, so it has to be the localized copy, not the original.
  expect(message).not.toBe(original)
  expect(message).toContain('Reinstall the app')
  expect(message).toContain(SCHEMA_NOTEBOOK_PYTHON_UNAVAILABLE_CODE)
  // "not found" would send the user looking for a file instead of reinstalling.
  expect(message).not.toContain('not found')
})

it('keeps the table-missing sentence for its own code', async () => {
  register(() =>
    Promise.reject(
      new ApplicationCommandError(SCHEMA_NOTEBOOK_TABLE_MISSING_CODE, 'ENOENT: /secret/table.csv')
    )
  )

  const error = await rejection()

  const message = (error as Error).message
  expect(message).toContain('The table file from the previous import is missing')
  expect(message).toContain(SCHEMA_NOTEBOOK_TABLE_MISSING_CODE)
  // The path never reaches the panel.
  expect(message).not.toContain('/secret/table.csv')
})

it('lets an uncoded failure through unchanged', async () => {
  const failure = new Error('kernel exited')
  register(() => Promise.reject(failure))

  await expect(rejection()).resolves.toBe(failure)
})

await configureTestElectronHost(await import('electron'))
