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
  SCHEMA_NOTEBOOK_CSV_ENCODING_CODE,
  SCHEMA_NOTEBOOK_PYTHON_UNAVAILABLE_CODE,
  SCHEMA_NOTEBOOK_RUN_OUTPUT_LIMIT_CODE,
  SCHEMA_NOTEBOOK_TABLE_MISSING_CODE
} from '../../../shared/schema-notebook'
import { registerSchemaNotebookIpc } from './ipc'
import type { SchemaNotebookService } from './service'
import type { NativeTranslator } from '../../locale/main-process-messages'

// Returns the English key with its code filled in, which is what an untranslated locale sees. The
// assertions compare against that, not against the message the service threw.
const translate: NativeTranslator = (key, options) =>
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

it('keeps the encoding sentence for its own code and names the code on the panel', async () => {
  // This failure used to reach the panel without its code, so a support report could not quote it.
  register(() =>
    Promise.reject(
      new ApplicationCommandError(
        SCHEMA_NOTEBOOK_CSV_ENCODING_CODE,
        'Choose a UTF-8 or Shift_JIS CSV file.'
      )
    )
  )

  const error = await rejection()

  const message = (error as Error).message
  expect(message).toContain('Choose a CSV file in UTF-8 or Shift-JIS.')
  expect(message).toContain(SCHEMA_NOTEBOOK_CSV_ENCODING_CODE)
})

it('lets an uncoded failure through unchanged', async () => {
  const failure = new Error('kernel exited')
  register(() => Promise.reject(failure))

  await expect(rejection()).resolves.toBe(failure)
})

it('turns an unrecordable output run into the sentences with its caps and code', async () => {
  register(() =>
    Promise.reject(
      new ApplicationCommandError(
        SCHEMA_NOTEBOOK_RUN_OUTPUT_LIMIT_CODE,
        'This run left more than 200 output files or 512 MB of output files, so its results were not saved.'
      )
    )
  )

  const error = await rejection()

  const message = (error as Error).message
  // The user needs the caps to know why it failed, and the code so support can trace it.
  expect(message).toContain('200 files and 512 MB')
  expect(message).toContain(SCHEMA_NOTEBOOK_RUN_OUTPUT_LIMIT_CODE)
  // Not the raw service message: that one is English-only and names no next step.
  expect(message).not.toBe(
    'This run left more than 200 output files or 512 MB of output files, so its results were not saved.'
  )
})

await configureTestElectronHost(await import('electron'))
