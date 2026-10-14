import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { findPythonCommand, probeInterpreterVersion, type PythonCommand } from '../python-command'

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
  | { ok: true; command: PythonCommand; source: 'bundled' | 'system' }
  | { ok: false; message: string }

const missingRuntimeMessage = (expected: string): string =>
  `The offline schema-notebook Python runtime was not found at ${expected}. ` +
  `It must be bundled in the installer with ${SCHEMA_NOTEBOOK_PYTHON_PACKAGES.join(', ')}. ` +
  'It is not downloaded on first run.'

/**
 * Prefers the installer prefix under resources/schema-notebook-python, then a
 * developer checkout of that same tree, then a Python 3 already on PATH.
 * There is no download and no micromamba/CDN provisioning on this path.
 */
export const resolveSchemaNotebookPython = async (
  deps: {
    platform?: NodeJS.Platform
    arch?: string
    resourcesPath?: string
    devRoots?: readonly string[]
    exists?: (path: string) => boolean
    probe?: (command: PythonCommand) => Promise<boolean>
    findSystemPython?: () => Promise<PythonCommand | undefined>
  } = {}
): Promise<SchemaNotebookPythonResolution> => {
  const platform = deps.platform ?? process.platform
  const arch = deps.arch ?? process.arch
  const exists = deps.exists ?? existsSync
  const probe =
    deps.probe ??
    (async (command: PythonCommand) =>
      (await probeInterpreterVersion(command.command, command.baseArgs, { platform })) !==
      undefined)
  const roots = [
    ...(deps.resourcesPath ? [join(deps.resourcesPath, SCHEMA_NOTEBOOK_PYTHON_DIR)] : []),
    ...(deps.devRoots ?? schemaNotebookPythonDevRoots())
  ]
  for (const root of roots) {
    const command = bundledPythonExecutable(root, platform, arch)
    if (!exists(command)) continue
    const candidate: PythonCommand = { command, baseArgs: [] }
    if (await probe(candidate)) return { ok: true, command: candidate, source: 'bundled' }
  }
  const system = await (deps.findSystemPython ?? (() => findPythonCommand({ platform })))()
  if (system) return { ok: true, command: system, source: 'system' }
  const expected = bundledPythonExecutable(
    join(deps.resourcesPath ?? '<resources>', SCHEMA_NOTEBOOK_PYTHON_DIR),
    platform,
    arch
  )
  return { ok: false, message: missingRuntimeMessage(expected) }
}
