import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  SCHEMA_NOTEBOOK_RUN_OUTPUT_MISSING_CODE,
  SCHEMA_NOTEBOOK_TABLE_MISSING_CODE
} from '../../../shared/schema-notebook'
import { ApplicationCommandError } from '../../../shared/application-command-contract'
import type { CommandRunner } from './local-execute'
import { createSchemaNotebookService } from './service'

const roots: string[] = []

const storageRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'schema-notebook-durability-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const CSV = ['patient_id,age,sex,readmission', 'P001,22,F,0', 'P002,51,M,1', 'P003,84,F,0'].join(
  '\n'
)

// A real PNG header and a real SVG document, so the collector sees the bytes a figure actually has.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect /></svg>'

const writeFigures: CommandRunner = async (_command, _scriptPath, cwd) => {
  await writeFile(join(cwd, 'plot.png'), PNG)
  await writeFile(join(cwd, 'plot.svg'), SVG)
  return { stdout: '3', stderr: '', code: 0 }
}

const service = (directory: string, extra: Partial<Parameters<typeof createSchemaNotebookService>[0]> = {}) =>
  createSchemaNotebookService({
    directory,
    approvalLogPath: join(directory, 'machine-approval.jsonl'),
    ...extra
  })

const importTable = async (
  notebook: ReturnType<typeof service>
): Promise<{ projectId: string; tableId: string }> => {
  const projectId = 'project-durability'
  const imported = await notebook.importTable({
    projectId,
    filename: 'study.csv',
    csvBase64: Buffer.from(CSV, 'utf8').toString('base64'),
    patientData: false
  })
  if (!imported.ok) throw new Error(`import blocked: ${imported.message}`)
  return { projectId, tableId: imported.context.tableId }
}

describe('schema Notebook run outputs survive the app', () => {
  it('records a run, lists it after a restart, and saves a byte-identical copy', async () => {
    const directory = await storageRoot()
    const destination = join(directory, 'saved-by-the-user.png')
    const first = service(directory, {
      run: writeFigures,
      chooseSavePath: async () => ({ canceled: false, filePath: destination })
    })
    const { projectId, tableId } = await importTable(first)

    const executed = await first.execute({
      projectId,
      tableId,
      language: 'python',
      code: 'print(1)'
    })

    expect(executed.local.outputs.map((output) => output.relativePath)).toEqual([
      'plot.png',
      'plot.svg'
    ])
    expect(executed.local.outputs[0]).toEqual({
      relativePath: 'plot.png',
      sizeBytes: PNG.byteLength,
      sha256: createHash('sha256').update(PNG).digest('hex'),
      mimeType: 'image/png'
    })
    expect(executed.local.outputs[1]?.mimeType).toBe('image/svg+xml')

    // The bytes are still on disk in the run directory, not just in the response.
    const stored = join(directory, 'runs', executed.runId, 'plot.png')
    expect(existsSync(stored)).toBe(true)
    expect(createHash('sha256').update(await readFile(stored)).digest('hex')).toBe(
      executed.local.outputs[0]!.sha256
    )

    // "Close and reopen": a brand new service instance with no in-memory state reads the record.
    const restarted = service(directory, {
      chooseSavePath: async () => ({ canceled: false, filePath: destination })
    })
    const record = await restarted.lastRun(projectId, tableId)
    expect(record).not.toBeNull()
    expect(record!.runId).toBe(executed.runId)
    expect(record!.outputs).toEqual(executed.local.outputs)
    // The record holds no stdout/stderr text: those can quote rows, and this file outlives the panel.
    expect(Object.keys(record!)).not.toContain('stdout')
    expect(Object.keys(record!)).not.toContain('stderr')

    // A saved copy must hash to the checksum the run recorded.
    await expect(
      restarted.saveOutput({ projectId, runId: executed.runId, relativePath: 'plot.png' })
    ).resolves.toEqual({ saved: true })
    expect(createHash('sha256').update(await readFile(destination)).digest('hex')).toBe(
      executed.local.outputs[0]!.sha256
    )
  })

  it('saves the recorded bytes through the dialog, and a cancelled dialog is not an error', async () => {
    const directory = await storageRoot()
    const destination = join(directory, 'copy.png')
    let defaultPathSeen: string | undefined
    let cancel = false
    const notebook = service(directory, {
      run: writeFigures,
      chooseSavePath: async (options) => {
        defaultPathSeen = options.defaultPath
        return cancel ? { canceled: true } : { canceled: false, filePath: destination }
      }
    })
    const { projectId, tableId } = await importTable(notebook)
    const executed = await notebook.execute({ projectId, tableId, language: 'python', code: 'print(1)' })

    await expect(
      notebook.saveOutput({ projectId, runId: executed.runId, relativePath: 'plot.png' })
    ).resolves.toEqual({ saved: true })
    expect(defaultPathSeen).toBe('plot.png')
    expect(await readFile(destination)).toEqual(PNG)

    cancel = true
    await expect(
      notebook.saveOutput({ projectId, runId: executed.runId, relativePath: 'plot.svg' })
    ).resolves.toEqual({ saved: false })
    expect(existsSync(join(directory, 'plot.svg'))).toBe(false)
  })

  it('reports a missing or changed file instead of saving the wrong bytes', async () => {
    const directory = await storageRoot()
    const destination = join(directory, 'copy.png')
    const notebook = service(directory, {
      run: writeFigures,
      chooseSavePath: async () => ({ canceled: false, filePath: destination })
    })
    const { projectId, tableId } = await importTable(notebook)
    const executed = await notebook.execute({ projectId, tableId, language: 'python', code: 'print(1)' })
    const stored = join(directory, 'runs', executed.runId, 'plot.png')

    await rm(stored)
    const missing = await notebook
      .saveOutput({ projectId, runId: executed.runId, relativePath: 'plot.png' })
      .catch((error: unknown) => error)
    expect(missing).toBeInstanceOf(ApplicationCommandError)
    expect((missing as ApplicationCommandError).code).toBe(
      SCHEMA_NOTEBOOK_RUN_OUTPUT_MISSING_CODE
    )

    // A file whose bytes changed after the run must not be saved under the recorded checksum.
    await writeFile(stored, Buffer.concat([PNG, Buffer.from('tampered')]))
    const changed = await notebook
      .saveOutput({ projectId, runId: executed.runId, relativePath: 'plot.png' })
      .catch((error: unknown) => error)
    expect(changed).toBeInstanceOf(ApplicationCommandError)
    expect((changed as ApplicationCommandError).code).toBe(
      SCHEMA_NOTEBOOK_RUN_OUTPUT_MISSING_CODE
    )
    expect(existsSync(destination)).toBe(false)

    // Paths outside the run directory are refused before any read.
    await expect(
      notebook.saveOutput({ projectId, runId: executed.runId, relativePath: '../escape.png' })
    ).rejects.toThrow('Invalid run output path.')
    await expect(
      notebook.saveOutput({ projectId, runId: '../escape', relativePath: 'plot.png' })
    ).rejects.toThrow('Invalid schema Notebook run id.')
  })

  it('keeps the last run per table and ignores another table its own records', async () => {
    const directory = await storageRoot()
    const notebook = service(directory, { run: writeFigures })
    const first = await importTable(notebook)
    const second = await importTable(notebook)

    const firstRun = await notebook.execute({
      projectId: first.projectId,
      tableId: first.tableId,
      language: 'python',
      code: 'print(1)'
    })
    const secondRun = await notebook.execute({
      projectId: second.projectId,
      tableId: second.tableId,
      language: 'python',
      code: 'print(1)'
    })

    await expect(notebook.lastRun(first.projectId, first.tableId)).resolves.toMatchObject({
      runId: firstRun.runId
    })
    await expect(notebook.lastRun(second.projectId, second.tableId)).resolves.toMatchObject({
      runId: secondRun.runId
    })
    // The newest run for one table must not answer for the other.
    expect(firstRun.runId).not.toBe(secondRun.runId)

    // A table whose own csv is gone still answers with its run: the figures are independent of it.
    await rm(join(directory, 'tables', `${first.tableId}.csv`))
    const missing = await notebook
      .modelContext(first.projectId, first.tableId)
      .catch((error: unknown) => error)
    expect(missing).toBeInstanceOf(ApplicationCommandError)
    expect((missing as ApplicationCommandError).code).toBe(SCHEMA_NOTEBOOK_TABLE_MISSING_CODE)
    await expect(notebook.lastRun(first.projectId, first.tableId)).resolves.toMatchObject({
      runId: firstRun.runId
    })
  })
})

const bundledPython = join(
  process.cwd(),
  'resources',
  'schema-notebook-python',
  'win-x64',
  'python.exe'
)

// The real-process test runs the same figure code the beta acceptance used. It needs a Python with
// matplotlib; without one the deterministic test above still covers the durability contract.
const plotPythonAvailable = process.platform === 'win32' && existsSync(bundledPython)

describe.skipIf(!plotPythonAvailable)('schema Notebook figures from a real process', () => {
  it('keeps a matplotlib PNG and SVG written with relative names', async () => {
    const directory = await storageRoot()
    const notebook = service(directory, {
      resolvePython: async () => ({ command: bundledPython, baseArgs: [] })
    })
    const { projectId, tableId } = await importTable(notebook)
    const executed = await notebook.execute({
      projectId,
      tableId,
      language: 'python',
      code: [
        'import os, matplotlib',
        'matplotlib.use("Agg")',
        'import matplotlib.pyplot as plt',
        'import pandas as pd',
        'df = pd.read_csv(os.environ["DRA_SCHEMA_TABLE"])',
        'fig, ax = plt.subplots()',
        'ax.bar([str(v) for v in df["age"]], df["readmission"])',
        'fig.savefig("plot.png")',
        'fig.savefig("plot.svg")',
        'print(len(df))'
      ].join('\n')
    })

    expect(executed.local.exitCode).toBe(0)
    expect(executed.local.stdout.trim()).toBe('3')
    const names = executed.local.outputs.map((output) => output.relativePath)
    expect(names).toEqual(['plot.png', 'plot.svg'])
    const png = executed.local.outputs[0]!
    expect(png.mimeType).toBe('image/png')
    expect(png.sizeBytes).toBeGreaterThan(1_000)
    const bytes = await readFile(join(directory, 'runs', executed.runId, 'plot.png'))
    expect(bytes.byteLength).toBe(png.sizeBytes)
    // A real PNG signature, not a text placeholder.
    expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect((await stat(join(directory, 'runs', executed.runId))).isDirectory()).toBe(true)
    // And it is still listed after a restart.
    await expect(notebook.lastRun(projectId, tableId)).resolves.toMatchObject({
      runId: executed.runId
    })
  })
})
