import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'

import { SCHEMA_NOTEBOOK_LOCAL_FILENAME } from '../../../shared/schema-notebook'
import { SCHEMA_NOTEBOOK_PYTHON_UNAVAILABLE_CODE } from '../../../shared/schema-notebook'
import type {
  SchemaNotebookPythonInterpreter,
  SchemaNotebookRunOutput
} from '../../../shared/schema-notebook'
import { ApplicationCommandError } from '../../../shared/application-command-contract'
import type { PythonCommand } from '../python-command'
import { resolveSchemaNotebookPython } from './bundled-python'

export type LocalRunResult = {
  stdout: string
  stderr: string
  exitCode: number | null
  head?: string
  table?: string
  /** Which interpreter ran the script, so the panel can say so instead of guessing. */
  interpreter?: SchemaNotebookPythonInterpreter
  /** Identity of this run. The caller stores it with the run record. */
  runId: string
  /** Files the script left in its run directory, with the checksum recorded at run end. */
  outputs: SchemaNotebookRunOutput[]
}

type ResolvedAnalysisCommand = {
  command: PythonCommand
  interpreter?: SchemaNotebookPythonInterpreter
}

export type CommandRunner = (
  command: PythonCommand,
  scriptPath: string,
  cwd: string,
  env: NodeJS.ProcessEnv
) => Promise<{ stdout: string; stderr: string; code: number | null }>

const OUTPUT_LIMIT = 1_000_000

// A local run now keeps its files instead of deleting them along with the temporary directory it used
// to use. These caps are a backstop against a runaway loop filling the data folder: exceeding them
// fails the run loudly (see `collectRunOutputs`) rather than silently dropping files from the list.
const MAX_OUTPUT_FILES = 200
const MAX_OUTPUT_BYTES = 512 * 1024 * 1024

const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

const clip = (text: string): string =>
  text.length > OUTPUT_LIMIT ? `${text.slice(0, OUTPUT_LIMIT)}\n[truncated]` : text

// The run directory is derived in one place so the service, the record writer, and the save-dialog
// path check can never disagree about where a run's files live.
export const schemaNotebookRunDirectory = (runsDirectory: string, runId: string): string => {
  if (!SAFE_RUN_ID.test(runId)) throw new Error('Invalid schema Notebook run id.')
  return join(runsDirectory, runId)
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.csv': 'text/csv',
  '.tsv': 'text/tab-separated-values',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.zip': 'application/zip'
}

export const mimeTypeForRunOutput = (relativePath: string): string =>
  MIME_BY_EXTENSION[extname(relativePath).toLowerCase()] ?? 'application/octet-stream'

const sha256OfFile = (path: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })

// Collects everything the script left behind in its run directory. `excluded` holds the two files the
// app wrote itself (the script and the table copy) by absolute path, so no name heuristic can make a
// user file disappear from the list. A read failure aborts the whole run: a list that silently skipped
// a file would claim the run produced less than it did.
export const collectRunOutputs = async (
  directory: string,
  excluded: ReadonlySet<string>
): Promise<SchemaNotebookRunOutput[]> => {
  const outputs: SchemaNotebookRunOutput[] = []
  let totalBytes = 0

  const walk = async (current: string, prefix: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const absolute = join(current, entry.name)
      const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      // A symlink may point outside the run directory; it is not this run's output.
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        await walk(absolute, relativePath)
        continue
      }
      if (!entry.isFile() || excluded.has(absolute)) continue
      const stats = await stat(absolute)
      totalBytes += stats.size
      if (outputs.length >= MAX_OUTPUT_FILES) {
        throw new Error(
          `This run left more than ${MAX_OUTPUT_FILES} output files, so its results were not saved. Reduce the number of files the script writes and run again.`
        )
      }
      if (totalBytes > MAX_OUTPUT_BYTES) {
        throw new Error(
          `This run left more than ${Math.floor(MAX_OUTPUT_BYTES / (1024 * 1024))} MB of output files, so its results were not saved. Write smaller files from the script and run again.`
        )
      }
      outputs.push({
        relativePath,
        sizeBytes: stats.size,
        sha256: await sha256OfFile(absolute),
        mimeType: mimeTypeForRunOutput(relativePath)
      })
    }
  }

  await walk(directory, '')
  return outputs.sort((left, right) =>
    left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0
  )
}

const defaultRunner: CommandRunner = (command, scriptPath, cwd, env) =>
  new Promise((resolve, reject) => {
    const child = spawn(command.command, [...command.baseArgs, scriptPath], {
      cwd,
      env,
      windowsHide: true
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => child.kill(), 60_000)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      if (stdout.length < OUTPUT_LIMIT) stdout += chunk
    })
    child.stderr.on('data', (chunk: string) => {
      if (stderr.length < OUTPUT_LIMIT) stderr += chunk
    })
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      resolve({ stdout: clip(stdout), stderr: clip(stderr), code })
    })
  })

const looksLikeTable = (text: string): boolean => {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  if (lines.length < 2) return false
  if (lines.every((line) => line.startsWith('|'))) return true
  const widths = lines.map((line) => line.split(',').length)
  return widths[0] > 1 && widths.every((width) => width === widths[0])
}

const scriptFor = (
  language: 'python' | 'r',
  code: string
): { filename: string; source: string } => {
  if (language === 'python') {
    return {
      filename: 'analysis.py',
      source: code
    }
  }
  return {
    filename: 'analysis.R',
    source: code
  }
}

// Runs one local analysis inside a durable per-run directory. Only the app's own scratch files (the
// script and the table copy) are removed afterwards; every other file the script wrote is collected and
// kept, so a figure survives the run, a project switch, and an app restart (#121).
export const executeLocalAnalysis = async (input: {
  language: 'python' | 'r'
  code: string
  tableCsv: string
  runId: string
  runsDirectory: string
  resolvePython?: () => Promise<PythonCommand>
  resolveR?: () => Promise<PythonCommand | undefined>
  run?: CommandRunner
}): Promise<LocalRunResult> => {
  const run = input.run ?? defaultRunner
  const directory = schemaNotebookRunDirectory(input.runsDirectory, input.runId)
  await mkdir(directory, { recursive: true })
  const tablePath = join(directory, SCHEMA_NOTEBOOK_LOCAL_FILENAME)
  const script = scriptFor(input.language, input.code)
  const scriptPath = join(directory, script.filename)
  // The table copy keeps its historical name inside the run directory, so a script that reads
  // `table.csv` relatively still works. Both scratch files are removed after the run; every other file
  // is treated as an output.
  const scratch = new Set([tablePath, scriptPath])
  try {
    await writeFile(tablePath, input.tableCsv, { encoding: 'utf8', mode: 0o600 })
    await writeFile(scriptPath, script.source, { encoding: 'utf8', mode: 0o600 })
    const command = await resolveAnalysisCommand(input)
    if ('message' in command) {
      return {
        stdout: '',
        stderr: command.message,
        exitCode: 127,
        runId: input.runId,
        outputs: []
      }
    }
    const result = await run(command.command, scriptPath, directory, {
      ...process.env,
      DRA_SCHEMA_TABLE: tablePath
    })
    const stdout = clip(result.stdout)
    const head = /\.head\s*\(/.test(input.code) ? stdout : undefined
    const table = looksLikeTable(stdout) ? stdout : undefined
    // A failed script can still have written a partial figure. Keep and list what exists, and let the
    // non-zero exit code carry the failure.
    const outputs = await collectRunOutputs(directory, scratch)
    return {
      stdout,
      stderr: clip(result.stderr),
      exitCode: result.code,
      ...(command.interpreter === undefined ? {} : { interpreter: command.interpreter }),
      ...(head === undefined ? {} : { head }),
      ...(table === undefined ? {} : { table }),
      runId: input.runId,
      outputs
    }
  } finally {
    // Best effort: a leftover scratch file is not a reason to fail a run whose outputs are recorded.
    await Promise.all([
      rm(scriptPath, { force: true }).catch(() => undefined),
      rm(tablePath, { force: true }).catch(() => undefined)
    ])
  }
}

const resolveAnalysisCommand = async (
  input: Pick<Parameters<typeof executeLocalAnalysis>[0], 'language' | 'resolvePython' | 'resolveR'>
): Promise<ResolvedAnalysisCommand | { message: string }> => {
  if (input.language === 'python') {
    if (input.resolvePython) return { command: await input.resolvePython() }
    const resolved = await resolveSchemaNotebookPython()
    // A packaged runtime that exists but cannot start is a broken installation, not a script error.
    // It gets a stable code so the panel can show an operable, localized sentence; the "not found"
    // case keeps the in-panel message it always had.
    if (!resolved.ok && resolved.reason === 'unusable') {
      throw new ApplicationCommandError(SCHEMA_NOTEBOOK_PYTHON_UNAVAILABLE_CODE, resolved.message)
    }
    if (!resolved.ok) return { message: resolved.message }
    return {
      command: resolved.command,
      interpreter: { source: resolved.source, version: resolved.version }
    }
  }
  const resolvedR = await (input.resolveR ?? defaultResolveR)()
  return resolvedR
    ? { command: resolvedR }
    : { message: 'Rscript was not found in the local Notebook environment.' }
}

const defaultResolveR = async (): Promise<PythonCommand | undefined> => {
  const candidate: PythonCommand = { command: 'Rscript', baseArgs: [] }
  try {
    await defaultRunner(candidate, '--version', tmpdir(), process.env)
  } catch {
    return undefined
  }
  return candidate
}
