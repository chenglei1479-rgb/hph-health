import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createLogger } from '@aipoch/diagnostics/node'

import { findPythonCommand, probeInterpreterVersion, type PythonCommand } from '../python-command'

const pythonLog = createLogger('notebook:python')

/**
 * Offline statistical stack for the schema-only Notebook. These wheels are part of
 * the installer prefix. The app must not pip-install or CDN-fetch them on first run.
 *
 * The unsigned beta stages one prefix per arch. Current stripped CPython plus
 * wheels add roughly 120–200 MB to that installer. See
 * resources/schema-notebook-python/PACKAGING.md.
 */
export const SCHEMA_NOTEBOOK_PYTHON_PACKAGES = [
  'pandas',
  'numpy',
  'scipy',
  'statsmodels',
  'matplotlib',
  'openpyxl',
  'lifelines'
] as const

export const SCHEMA_NOTEBOOK_PYTHON_DIR = 'schema-notebook-python'

const here = typeof __dirname === 'string' ? __dirname : dirname(fileURLToPath(import.meta.url))

export const schemaNotebookPythonSubdir = (
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): string => {
  if (platform === 'win32' && arch === 'x64') return 'win-x64'
  if (platform === 'win32' && arch === 'arm64') return 'win-arm64'
  if (platform === 'darwin' && arch === 'arm64') return 'darwin-arm64'
  if (platform === 'darwin' && arch === 'x64') return 'darwin-x64'
  if (platform === 'linux' && arch === 'x64') return 'linux-x64'
  if (platform === 'linux' && arch === 'arm64') return 'linux-arm64'
  return `${platform}-${arch}`
}

export const bundledPythonExecutable = (
  root: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): string => {
  const subdir = schemaNotebookPythonSubdir(platform, arch)
  return platform === 'win32'
    ? join(root, subdir, 'python.exe')
    : join(root, subdir, 'bin', 'python')
}

/** Dev checkout of resources/schema-notebook-python. Absent inside a packaged asar. */
export const schemaNotebookPythonDevRoots = (): string[] => [
  join(here, '../../../../resources', SCHEMA_NOTEBOOK_PYTHON_DIR),
  join(here, '../../../resources', SCHEMA_NOTEBOOK_PYTHON_DIR)
]

export type SchemaNotebookPythonResolution =
  | {
      ok: true
      command: PythonCommand
      source: 'bundled' | 'system'
      /** Reported by `--version`, e.g. `3.12.15`. `unknown` when the probe could not read it. */
      version: string
    }
  | { ok: false; message: string }

const missingRuntimeMessage = (expected: string): string =>
  `The offline schema-notebook Python runtime was not found at ${expected}. ` +
  `It must be bundled in the installer with ${SCHEMA_NOTEBOOK_PYTHON_PACKAGES.join(', ')}. ` +
  'It is not downloaded on first run.'

/**
 * Prefers the installer prefix under resources/schema-notebook-python, then a
 * developer checkout of that same tree, then a Python 3 already on PATH.
 * There is no download and no micromamba/CDN provisioning on this path.
 *
 * Falling back to PATH is not silent: the choice and the reported version go to the log as
 * `{ source, version }` (never the path), and the Notebook shows which interpreter ran a script.
 */
export const resolveSchemaNotebookPython = async (
  deps: {
    platform?: NodeJS.Platform
    arch?: string
    resourcesPath?: string
    devRoots?: readonly string[]
    exists?: (path: string) => boolean
    /** Returns the version reported by `--version`, or undefined when the interpreter cannot run. */
    probe?: (command: PythonCommand) => Promise<string | undefined>
    findSystemPython?: () => Promise<PythonCommand | undefined>
  } = {}
): Promise<SchemaNotebookPythonResolution> => {
  const platform = deps.platform ?? process.platform
  const arch = deps.arch ?? process.arch
  const exists = deps.exists ?? existsSync
  const probe =
    deps.probe ??
    ((command: PythonCommand) =>
      probeInterpreterVersion(command.command, command.baseArgs, { platform }))
  // Packaged apps put the prefix next to app.asar. A relative walk out of the bundle breaks
  // when the chunk depth changes, and on macOS it depends on a case-insensitive volume.
  const resourcesPath =
    deps.resourcesPath ??
    (typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0
      ? process.resourcesPath
      : undefined)
  const roots = [
    ...(resourcesPath ? [join(resourcesPath, SCHEMA_NOTEBOOK_PYTHON_DIR)] : []),
    ...(deps.devRoots ?? schemaNotebookPythonDevRoots())
  ]
  for (const root of roots) {
    const command = bundledPythonExecutable(root, platform, arch)
    if (!exists(command)) continue
    const candidate: PythonCommand = { command, baseArgs: [] }
    const version = await probe(candidate)
    if (version) {
      pythonLog.info('interpreter resolved', { source: 'bundled', version })
      return { ok: true, command: candidate, source: 'bundled', version }
    }
    // The prefix exists but could not be executed: say so, because the next step is the PATH
    // fallback and that changes which packages are available.
    pythonLog.warn('bundled interpreter did not answer --version', { source: 'bundled' })
  }
  const system = await (deps.findSystemPython ?? (() => findPythonCommand({ platform })))()
  if (system) {
    const version = (await probe(system)) ?? 'unknown'
    pythonLog.warn('falling back to an interpreter on PATH', { source: 'system', version })
    return { ok: true, command: system, source: 'system', version }
  }
  const expected = bundledPythonExecutable(
    join(resourcesPath ?? '<resources>', SCHEMA_NOTEBOOK_PYTHON_DIR),
    platform,
    arch
  )
  pythonLog.warn('no interpreter resolved', { source: 'missing' })
  return { ok: false, message: missingRuntimeMessage(expected) }
}
