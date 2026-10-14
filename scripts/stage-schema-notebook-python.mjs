/* eslint-disable @typescript-eslint/explicit-function-return-type */

// Stages one relocatable CPython 3.12 prefix plus the schema-notebook stats
// packages. The unsigned internal beta workflow runs this before electron-builder.
// The app never downloads this tree on first run.

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const PYTHON_STANDALONE_RELEASE = '20261013'
export const PYTHON_STANDALONE_VERSION = '3.12.15'

export const SCHEMA_NOTEBOOK_PYTHON_TARGETS = [
  {
    platform: 'mac',
    arch: 'arm64',
    triple: 'aarch64-apple-darwin',
    subdir: 'darwin-arm64',
    executable: 'bin/python',
    sha256: '9866e11cf2ae9caa1e671383786f248859a52dd8bfb702fb4c0dc2c65f1d36de'
  },
  {
    platform: 'mac',
    arch: 'x64',
    triple: 'x86_64-apple-darwin',
    subdir: 'darwin-x64',
    executable: 'bin/python',
    sha256: 'd09998f85752b646873a8a6bc7eea442a0d251b1c8d2413aa8ea06ef131c3335'
  },
  {
    platform: 'win',
    arch: 'x64',
    triple: 'x86_64-pc-windows-msvc',
    subdir: 'win-x64',
    executable: 'python.exe',
    sha256: '7a2aef48e5ee569e310b29b32681debbc5d888e92790d85331a47736c6b06aad'
  }
]

export function schemaNotebookPythonTarget(platform, arch) {
  const found = SCHEMA_NOTEBOOK_PYTHON_TARGETS.find(
    (target) => target.platform === platform && target.arch === arch
  )
  if (!found) {
    throw new Error(
      `The unsigned beta bundles schema-notebook Python for mac arm64, mac x64, and win x64 only. Got ${platform} ${arch}.`
    )
  }
  return found
}

export function standaloneArchiveName(target) {
  return `cpython-${PYTHON_STANDALONE_VERSION}+${PYTHON_STANDALONE_RELEASE}-${target.triple}-install_only_stripped.tar.gz`
}

export function standaloneArchiveUrl(target) {
  return `https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_STANDALONE_RELEASE}/${encodeURIComponent(standaloneArchiveName(target))}`
}

/**
 * Wheel tag compatible with electron-builder's macOS 12 minimum. A newer GitHub
 * runner would otherwise select a macOS 14-only scipy wheel.
 */
export function wheelPlatformTag(target) {
  if (target.platform === 'win') return 'win_amd64'
  if (target.arch === 'arm64') return 'macosx_12_0_arm64'
  return 'macosx_12_0_x86_64'
}

export function pythonCommand(pythonPath, target, host = process) {
  if (host.platform === 'darwin' && host.arch === 'arm64' && target.arch === 'x64') {
    return { command: 'arch', args: ['-x86_64', pythonPath] }
  }
  return { command: pythonPath, args: [] }
}

/** electron-builder copies a symlink as a symlink. A regular file still runs after packaging. */
export function materializePythonBinary(dest, executable) {
  const binary = join(dest, executable)
  if (!existsSync(binary)) {
    throw new Error(`Extracted Python prefix has no ${executable}`)
  }
  if (executable === 'python.exe' || !lstatSync(binary).isSymbolicLink()) {
    if (executable !== 'python.exe') chmodSync(binary, 0o755)
    return
  }
  const source = resolve(dirname(binary), readlinkSync(binary))
  unlinkSync(binary)
  copyFileSync(source, binary)
  chmodSync(binary, 0o755)
}

const run = (spawn, command, args, env) => {
  const result = spawn(command, args, { stdio: 'inherit', env })
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`)
  }
}

export async function stageSchemaNotebookPython({
  platform = process.env.SCHEMA_NOTEBOOK_PLATFORM,
  arch = process.env.SCHEMA_NOTEBOOK_ARCH,
  root = ROOT,
  spawn = spawnSync,
  fetchImpl = globalThis.fetch
} = {}) {
  const target = schemaNotebookPythonTarget(platform, arch)
  const dest = join(root, 'resources', 'schema-notebook-python', target.subdir)
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })

  const url = standaloneArchiveUrl(target)
  console.error(`[schema-notebook-python] downloading ${url}`)
  const response = await fetchImpl(url)
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for ${url}`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (digest !== target.sha256) {
    throw new Error(
      `SHA256 mismatch for ${standaloneArchiveName(target)}: expected ${target.sha256}, got ${digest}`
    )
  }
  const archive = join(tmpdir(), standaloneArchiveName(target))
  writeFileSync(archive, bytes)
  run(spawn, 'tar', ['-xzf', archive, '-C', dest, '--strip-components=1'])
  rmSync(archive, { force: true })
  materializePythonBinary(dest, target.executable)

  const pythonPath = join(dest, target.executable)
  const launch = pythonCommand(pythonPath, target)
  const env = {
    ...process.env,
    PYTHONNOUSERSITE: '1',
    PIP_DISABLE_PIP_VERSION_CHECK: '1'
  }
  const sitePackages =
    target.platform === 'win'
      ? join(dest, 'Lib', 'site-packages')
      : join(dest, 'lib', 'python3.12', 'site-packages')
  const requirements = join(root, 'resources', 'schema-notebook-python', 'requirements.txt')
  run(
    spawn,
    launch.command,
    [
      ...launch.args,
      '-m',
      'pip',
      'install',
      '--no-cache-dir',
      '--only-binary=:all:',
      '--platform',
      wheelPlatformTag(target),
      '--python-version',
      '312',
      '--implementation',
      'cp',
      '--abi',
      'cp312',
      '--target',
      sitePackages,
      '-r',
      requirements
    ],
    env
  )
  run(
    spawn,
    launch.command,
    [
      ...launch.args,
      '-c',
      'import pandas, numpy, scipy, statsmodels, matplotlib, openpyxl, lifelines'
    ],
    env
  )
  console.error(`[schema-notebook-python] staged ${dest}`)
  return dest
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  stageSchemaNotebookPython().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
