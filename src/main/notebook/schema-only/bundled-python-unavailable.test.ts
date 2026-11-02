import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApplicationCommandError } from '../../../shared/application-command-contract'
import { SCHEMA_NOTEBOOK_PYTHON_UNAVAILABLE_CODE } from '../../../shared/schema-notebook'

const resolution = vi.hoisted(() => ({
  value: {
    ok: false as const,
    reason: 'unusable' as 'unusable' | 'missing',
    message: 'The bundled Python runtime could not start, so the analysis was not run.'
  }
}))

vi.mock('./bundled-python', async (original) => {
  const actual = await original<typeof import('./bundled-python')>()
  return { ...actual, resolveSchemaNotebookPython: async () => resolution.value }
})

const { executeLocalAnalysis } = await import('./local-execute')

const roots: string[] = []

const runsDirectory = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'schema-notebook-interpreter-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('schema-notebook interpreter failures', () => {
  it('raises a coded error when the packaged interpreter exists but cannot start', async () => {
    resolution.value = {
      ok: false,
      reason: 'unusable',
      message: 'The bundled Python runtime could not start, so the analysis was not run.'
    }

    const error = await executeLocalAnalysis({
      language: 'python',
      code: 'print(1)',
      tableCsv: 'a\n1',
      runId: 'run-unusable',
      runsDirectory: await runsDirectory()
    }).catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(ApplicationCommandError)
    expect((error as ApplicationCommandError).code).toBe(SCHEMA_NOTEBOOK_PYTHON_UNAVAILABLE_CODE)
  })

  it('keeps the in-panel message when no interpreter was found at all', async () => {
    resolution.value = {
      ok: false,
      reason: 'missing',
      message: 'The offline schema-notebook Python runtime was not found.'
    }

    const result = await executeLocalAnalysis({
      language: 'python',
      code: 'print(1)',
      tableCsv: 'a\n1',
      runId: 'run-missing',
      runsDirectory: await runsDirectory()
    })

    expect(result.exitCode).toBe(127)
    expect(result.stderr).toContain('was not found')
    // Nothing ran, so there is nothing to keep.
    expect(result.outputs).toEqual([])
  })
})
