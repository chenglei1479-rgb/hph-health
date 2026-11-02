import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SCHEMA_NOTEBOOK_LOCAL_FILENAME } from '../../../shared/schema-notebook'
import { SCHEMA_NOTEBOOK_RUN_OUTPUT_LIMIT_CODE } from '../../../shared/schema-notebook'
import { SCHEMA_NOTEBOOK_RUN_OUTPUT_UNREADABLE_CODE } from '../../../shared/schema-notebook'
import { ApplicationCommandError } from '../../../shared/application-command-contract'
import type { PythonCommand } from '../python-command'
import {
  executeLocalAnalysis,
  schemaNotebookRunDirectory,
  type CommandRunner
} from './local-execute'

const roots: string[] = []

const runsDirectory = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'schema-notebook-run-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('executeLocalAnalysis runner contract', () => {
  it.each<PythonCommand>([
    {
      command: 'C:/Program Files/DRA/resources/schema-notebook-python/win-x64/python.exe',
      baseArgs: []
    },
    { command: 'py', baseArgs: ['-3'] }
  ])('passes the complete PythonCommand for $command', async (command) => {
    const directory = await runsDirectory()
    const resolvePython = vi.fn(async () => command)
    const run = vi.fn<CommandRunner>(async (received, scriptPath, cwd, env) => {
      expect(typeof received).toBe('object')
      expect(received).toBe(command)
      expect([...received.baseArgs]).toEqual(command.baseArgs)
      // The script and the table copy live in the run directory, which is also the cwd, so a relative
      // save from the script lands where the collector looks for it.
      expect(cwd).toBe(schemaNotebookRunDirectory(directory, 'run-1'))
      expect(scriptPath).toBe(join(cwd, 'analysis.py'))
      expect(await readdir(cwd).then((names) => names.sort())).toEqual([
        'analysis.py',
        SCHEMA_NOTEBOOK_LOCAL_FILENAME
      ])
      expect(env).toEqual({
        ...process.env,
        DRA_SCHEMA_TABLE: join(cwd, SCHEMA_NOTEBOOK_LOCAL_FILENAME)
      })
      // The script writes one output with a relative path; the app must keep it.
      await writeFile(join(cwd, 'plot.png'), 'PNGDATA')
      return { stdout: '2', stderr: '', code: 0 }
    })

    const result = await executeLocalAnalysis({
      language: 'python',
      code: 'print(1+1)',
      tableCsv: 'value\n1\n',
      runId: 'run-1',
      runsDirectory: directory,
      resolvePython,
      run
    })

    expect(resolvePython).toHaveBeenCalledOnce()
    expect(run).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ stdout: '2', stderr: '', exitCode: 0, runId: 'run-1' })
    expect(result.outputs).toEqual([
      {
        relativePath: 'plot.png',
        sizeBytes: 7,
        sha256: createHash('sha256').update('PNGDATA').digest('hex'),
        mimeType: 'image/png'
      }
    ])
    // Only the app's own scratch files are removed: the figure outlives the run.
    expect(await readdir(schemaNotebookRunDirectory(directory, 'run-1'))).toEqual(['plot.png'])
  })
})

describe('executeLocalAnalysis output collection', () => {
  it('lists nested outputs with their real size, checksum, and type, and keeps them on disk', async () => {
    const directory = await runsDirectory()
    const run: CommandRunner = async (_command, _scriptPath, cwd, env) => {
      expect(env.DRA_SCHEMA_TABLE).toBe(join(cwd, SCHEMA_NOTEBOOK_LOCAL_FILENAME))
      await writeFile(join(cwd, 'plot.png'), 'PNGDATA')
      await mkdir(join(cwd, 'figures'))
      await writeFile(join(cwd, 'figures', 'nested.svg'), '<svg />')
      return { stdout: '', stderr: '', code: 0 }
    }

    const result = await executeLocalAnalysis({
      language: 'python',
      code: 'print(1)',
      tableCsv: 'value\n1\n',
      runId: 'run-outputs',
      runsDirectory: directory,
      resolvePython: async () => ({ command: 'python', baseArgs: [] }),
      run
    })

    expect(result.outputs.map((output) => output.relativePath)).toEqual([
      'figures/nested.svg',
      'plot.png'
    ])
    expect(result.outputs[1]).toEqual({
      relativePath: 'plot.png',
      sizeBytes: 7,
      sha256: createHash('sha256').update('PNGDATA').digest('hex'),
      mimeType: 'image/png'
    })
    expect(result.outputs[0]?.mimeType).toBe('image/svg+xml')
    // The panel saves a copy later, so the files must still be there after the call returns.
    expect(existsSync(join(directory, 'run-outputs', 'plot.png'))).toBe(true)
    expect(existsSync(join(directory, 'run-outputs', 'figures', 'nested.svg'))).toBe(true)
    expect(existsSync(join(directory, 'run-outputs', 'analysis.py'))).toBe(false)
    expect(existsSync(join(directory, 'run-outputs', SCHEMA_NOTEBOOK_LOCAL_FILENAME))).toBe(false)
  })

  it('fails with the cap code and leaves no directory when it records too many files', async () => {
    const directory = await runsDirectory()
    const run: CommandRunner = async (_command, _scriptPath, cwd) => {
      // A runaway loop: more files than the contract accepts. The run must report failure rather than
      // hand back a list that silently stops at the cap.
      for (let index = 0; index < 201; index += 1) {
        await writeFile(join(cwd, `out-${index}.txt`), 'x')
      }
      return { stdout: 'done', stderr: '', code: 0 }
    }

    const error = await executeLocalAnalysis({
      language: 'python',
      code: 'print(1)',
      tableCsv: 'value\n1\n',
      runId: 'run-too-many',
      runsDirectory: directory,
      resolvePython: async () => ({ command: 'python', baseArgs: [] }),
      run
    }).catch((reason: unknown) => reason)

    // The code, not the English sentence: the sentence is copy and may change.
    expect(error).toBeInstanceOf(ApplicationCommandError)
    expect((error as ApplicationCommandError).code).toBe(
      SCHEMA_NOTEBOOK_RUN_OUTPUT_LIMIT_CODE
    )
    // A directory with no run record would be unreachable in the panel and still occupy the disk.
    expect(existsSync(schemaNotebookRunDirectory(directory, 'run-too-many'))).toBe(false)
  })

  it('fails with the unreadable code, not the cap code, when a produced file cannot be read back', async () => {
    const directory = await runsDirectory()
    const run: CommandRunner = async (_command, _scriptPath, cwd) => {
      // The files were produced, but they cannot be read back (a lock, a quarantine, a cleanup). This is
      // not a limit failure, so it must not report the caps to the user.
      await rm(cwd, { recursive: true, force: true })
      return { stdout: 'done', stderr: '', code: 0 }
    }

    const error = await executeLocalAnalysis({
      language: 'python',
      code: 'print(1)',
      tableCsv: 'value\n1\n',
      runId: 'run-unreadable',
      runsDirectory: directory,
      resolvePython: async () => ({ command: 'python', baseArgs: [] }),
      run
    }).catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(ApplicationCommandError)
    expect((error as ApplicationCommandError).code).toBe(
      SCHEMA_NOTEBOOK_RUN_OUTPUT_UNREADABLE_CODE
    )
    // Same cleanup rule as the cap case: never leave a directory without a record.
    expect(existsSync(schemaNotebookRunDirectory(directory, 'run-unreadable'))).toBe(false)
  })

  it('removes the scratch files even when the script fails', async () => {
    const directory = await runsDirectory()
    const result = await executeLocalAnalysis({
      language: 'python',
      code: 'raise SystemExit(1)',
      tableCsv: 'value\n1\n',
      runId: 'run-failed',
      runsDirectory: directory,
      resolvePython: async () => ({ command: 'python', baseArgs: [] }),
      run: async () => ({ stdout: '', stderr: 'boom', code: 1 })
    })

    expect(result.exitCode).toBe(1)
    expect(result.outputs).toEqual([])
    expect(await readdir(join(directory, 'run-failed'))).toEqual([])
  })
})

describe('schemaNotebookRunDirectory', () => {
  it('refuses a run id that could escape the runs directory', () => {
    expect(() => schemaNotebookRunDirectory('/runs', '../escape')).toThrow(
      'Invalid schema Notebook run id.'
    )
    expect(() => schemaNotebookRunDirectory('/runs', '')).toThrow(
      'Invalid schema Notebook run id.'
    )
  })
})
