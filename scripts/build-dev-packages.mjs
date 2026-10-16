/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { spawn } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const repositoryRoot = resolve(import.meta.dirname, '..')

export function packageBuildProjects(root = repositoryRoot) {
  const solution = ts.readConfigFile(join(root, 'tsconfig.packages.json'), ts.sys.readFile)
  if (solution.error)
    throw new Error(ts.flattenDiagnosticMessageText(solution.error.messageText, '\n'))
  return solution.config.references.map(({ path }) => {
    const configPath = resolve(root, path)
    const config = ts.getParsedCommandLineOfConfigFile(
      configPath,
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: (error) => {
          throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'))
        }
      }
    )
    if (config.errors.length)
      throw new Error(
        ts.formatDiagnostics(config.errors, {
          getCanonicalFileName: (file) => file,
          getCurrentDirectory: () => root,
          getNewLine: () => '\n'
        })
      )
    return {
      root: dirname(configPath),
      configPath,
      config,
      outputs: new Set(
        config.fileNames
          .flatMap((file) => ts.getOutputFileNames(config, file, !ts.sys.useCaseSensitiveFileNames))
          .map((file) => resolve(file))
      )
    }
  })
}

// npm ci --install-links packs file: packages before their dist exists. TypeScript and the
// packaged app both resolve those names from node_modules, so replace the packed copy with
// a link to the workspace package. An existing link is left alone.
export function linkPackedFileDependencies(root = repositoryRoot) {
  const manifestPath = join(root, 'package.json')
  if (!existsSync(manifestPath)) return
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const specs = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.optionalDependencies
  }
  for (const [name, spec] of Object.entries(specs)) {
    if (typeof spec !== 'string' || !spec.startsWith('file:')) continue
    const source = resolve(root, spec.slice('file:'.length))
    const sourceManifest = join(source, 'package.json')
    if (!existsSync(sourceManifest)) continue
    const target = join(root, 'node_modules', name)
    if (!existsSync(target)) continue
    const info = lstatSync(target)
    if (info.isSymbolicLink()) continue
    if (!info.isDirectory()) continue
    const installedManifest = join(target, 'package.json')
    if (!existsSync(installedManifest)) continue
    if (JSON.parse(readFileSync(installedManifest, 'utf8')).name !== name) continue
    rmSync(target, { recursive: true, force: true })
    // Junctions do not require Windows developer mode. POSIX keeps a relative directory link.
    const linkTarget = process.platform === 'win32' ? source : relative(dirname(target), source)
    symlinkSync(linkTarget, target, process.platform === 'win32' ? 'junction' : 'dir')
  }
}

// Build mode trusts its metadata even when an individual emitted JS file has been deleted.
// Invalidate that project's metadata, then let TypeScript own compilation and dependency order.
export async function buildDevPackages({
  root = repositoryRoot,
  log = console.log,
  force = false,
  clean = false,
  packages
} = {}) {
  linkPackedFileDependencies(root)
  const graph = packageBuildProjects(root)
  const selected = new Set()
  const include = (project) => {
    if (!project) throw new Error('Unknown package build target')
    if (selected.has(project)) return
    selected.add(project)
    for (const ref of project.config.projectReferences ?? [])
      include(graph.find((candidate) => candidate.configPath === resolve(ref.path)))
  }
  if (packages)
    for (const name of packages) include(graph.find((p) => p.root === join(root, 'packages', name)))
  else graph.forEach(include)
  const projects = [...selected]
  for (const project of projects) {
    const out = project.config.options.outDir
    if (clean) {
      rmSync(out, { recursive: true, force: true })
      rmSync(project.config.options.tsBuildInfoFile, { force: true })
    } else if (existsSync(out)) {
      // Remove stale emit before compilation: downstream resolution must not see deleted modules.
      for (const file of readdirSync(out, { recursive: true })) {
        if (
          /\.(?:[cm]?js|d\.[cm]?ts)(?:\.map)?$/.test(file) &&
          !project.outputs.has(join(out, file))
        )
          rmSync(join(out, file))
      }
    }
    if ([...project.outputs].some((file) => !existsSync(file)))
      rmSync(project.config.options.tsBuildInfoFile, { force: true })
  }
  const start = performance.now()
  await new Promise((resolveBuild, reject) => {
    const child = spawn(
      process.execPath,
      [
        require.resolve('typescript/bin/tsc'),
        '--build',
        ...projects.map((project) => project.configPath),
        '--stopBuildOnErrors',
        ...(force ? ['--force'] : [])
      ],
      { cwd: root, stdio: 'inherit' }
    )
    child.once('error', reject)
    child.once('exit', (code, signal) =>
      code === 0 ? resolveBuild() : reject(new Error(`Package build failed (${signal ?? code}).`))
    )
  })
  log(
    `Packages ready (${((performance.now() - start) / 1000).toFixed(2)}s, ${clean ? 'clean' : 'incremental'}).`
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildDevPackages({
    clean: process.argv.includes('--clean'),
    force: process.argv.includes('--force'),
    packages: process.argv
      .find((arg) => arg.startsWith('--packages='))
      ?.slice(11)
      .split(',')
  })
}
