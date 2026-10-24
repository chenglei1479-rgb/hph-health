import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { SCHEMA_NOTEBOOK_LOCAL_FILENAME } from '../../../shared/schema-notebook'
import type { PythonCommand } from '../python-command'
import { resolveSchemaNotebookPython } from './bundled-python'

export type LocalRunResult = {
  stdout: string
  stderr: string
  exitCode: number | null
  head?: string
  table?: string
}

export type CommandRunner = (
  command: PythonCommand,
  scriptPath: string,
  cwd: string,
  env: NodeJS.ProcessEnv
) => Promise<{ stdout: string; stderr: string; code: number | null }>

const OUTPUT_LIMIT = 1_000_000

const clip = (text: string): string =>
  text.length > OUTPUT_LIMIT ? `${text.slice(0, OUTPUT_LIMIT)}\n[truncated]` : text

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

export const executeLocalAnalysis = async (input: {
  language: 'python' | 'r'
  code: string
  tableCsv: string
  resolvePython?: () => Promise<PythonCommand>
  resolveR?: () => Promise<PythonCommand | undefined>
  run?: CommandRunner
}): Promise<LocalRunResult> => {
  const run = input.run ?? defaultRunner
  const directory = await mkdtemp(join(tmpdir(), 'schema-notebook-'))
  try {
    const tablePath = join(directory, SCHEMA_NOTEBOOK_LOCAL_FILENAME)
    await writeFile(tablePath, input.tableCsv, { encoding: 'utf8', mode: 0o600 })
    const script = scriptFor(input.language, input.code)
    const scriptPath = join(directory, script.filename)
    await writeFile(scriptPath, script.source, { encoding: 'utf8', mode: 0o600 })
    const command = await resolveAnalysisCommand(input)
    if ('message' in command) {
      return { stdout: '', stderr: command.message, exitCode: 127 }
    }
    const result = await run(command, scriptPath, directory, {
      ...process.env,
      DRA_SCHEMA_TABLE: tablePath
    })
    const stdout = clip(result.stdout)
    const head = /\.head\s*\(/.test(input.code) ? stdout : undefined
    const table = looksLikeTable(stdout) ? stdout : undefined
    return {
      stdout,
      stderr: clip(result.stderr),
      exitCode: result.code,
      ...(head === undefined ? {} : { head }),
      ...(table === undefined ? {} : { table })
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

const resolveAnalysisCommand = async (
  input: Pick<Parameters<typeof executeLocalAnalysis>[0], 'language' | 'resolvePython' | 'resolveR'>
): Promise<PythonCommand | { message: string }> => {
  if (input.language === 'python') {
    if (input.resolvePython) return input.resolvePython()
    const resolved = await resolveSchemaNotebookPython()
    if (!resolved.ok) return { message: resolved.message }
    return resolved.command
  }
  const r = await (input.resolveR ?? defaultResolveR)()
  return r ?? { message: 'Rscript was not found in the local Notebook environment.' }
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
