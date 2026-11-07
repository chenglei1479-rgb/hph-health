/*
 * Snapshot the expensive-to-rebuild parts of a development tree before and after a heavy test run,
 * so a destructive step can be pinned to the run that caused it instead of guessed from a timeline.
 *
 * Usage (from anywhere inside the checkout):
 *   node scripts/ci/pkg-suite-snapshot.mjs before
 *   npx vitest run src/main/session-package
 *   node scripts/ci/pkg-suite-snapshot.mjs after
 *
 * `after` exits 1 when any guarded count decreased, and prints exactly which paths under
 * `packages/**` or `node_modules` disappeared between the two snapshots.
 *
 * Guarded because they are what a broken run actually destroys: tracked files (git status),
 * package sources, installed dependency directories and their bin links.
 *
 * `--root <dir>` and `--state <file>` exist for the self-test, which points both at a temporary tree
 * that is not a git checkout.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const argument = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index > 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const root = resolve(argument('--root', resolve(dirname(fileURLToPath(import.meta.url)), '../..')))
// The snapshot is scratch state, not evidence: it belongs in the OS temp directory. Writing it under
// `.scratch/` inside the checkout would make the guard the one thing still writing into the tree it
// exists to protect (#156).
const statePath = resolve(
  argument('--state', join(tmpdir(), 'open-science-pkg-suite-snapshot.json'))
)

const git = (args) => {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch {
    // A temporary tree in the self-test is not a checkout; an unavailable git is not an error.
    return undefined
  }
}

const countFiles = (directory, budget = 400_000) => {
  const paths = []
  const visit = (current) => {
    if (paths.length >= budget) return
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const child = join(current, entry.name)
      // Junctions and symlinks are counted as entries, never followed: following one would make
      // this measurement depend on a node_modules link and could walk the whole disk.
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) visit(child)
      else paths.push(child)
    }
  }
  if (existsSync(directory)) visit(directory)
  return paths
}

const countDirectories = (directory) => {
  try {
    return readdirSync(directory, { withFileTypes: true }).filter(
      (entry) => entry.isDirectory() || entry.isSymbolicLink()
    ).length
  } catch {
    return 0
  }
}

const snapshot = () => {
  const status = (git(['status', '--porcelain']) ?? '').split('\n').filter(Boolean)
  const packageFiles = countFiles(join(root, 'packages'))
  return {
    at: new Date().toISOString(),
    head: (git(['rev-parse', '--short', 'HEAD']) ?? 'unknown').trim(),
    branch: (git(['rev-parse', '--abbrev-ref', 'HEAD']) ?? 'unknown').trim(),
    statusCount: status.length,
    deletedCount: status.filter((line) => /^(?:..)?D/.test(line)).length,
    status,
    packagesFileCount: packageFiles.length,
    packagePaths: packageFiles.map((path) =>
      path
        .slice(root.length + 1)
        .split('\\')
        .join('/')
    ),
    nodeModulesDirectoryCount: countDirectories(join(root, 'node_modules')),
    binDirectory: existsSync(join(root, 'node_modules', '.bin'))
  }
}

const report = (label, value) =>
  console.log(
    `${label}: status=${value.statusCount} (deleted ${value.deletedCount}) ` +
      `packages=${value.packagesFileCount} files node_modules=${value.nodeModulesDirectoryCount} dirs ` +
      `.bin=${value.binDirectory ? 'present' : 'MISSING'} ${value.branch}@${value.head}`
  )

const mode = process.argv[2]
const current = snapshot()

if (mode === 'before') {
  mkdirSync(dirname(statePath), { recursive: true })
  writeFileSync(statePath, `${JSON.stringify(current, null, 2)}\n`)
  report('before', current)
  process.exit(0)
}

if (mode !== 'after') {
  console.error(
    'Usage: node scripts/ci/pkg-suite-snapshot.mjs before|after [--root <dir>] [--state <file>]'
  )
  process.exit(2)
}

if (!existsSync(statePath)) {
  console.error(
    `No snapshot recorded at ${statePath}. Run: node scripts/ci/pkg-suite-snapshot.mjs before`
  )
  process.exit(2)
}

const before = JSON.parse(readFileSync(statePath, 'utf8'))
report('before', before)
report('after ', current)

const lostPackages = before.packagePaths.filter((path) => !existsSync(join(root, path)))
const appeared = current.status.filter((line) => !before.status.includes(line))
const disappeared = before.status.filter((line) => !current.status.includes(line))
const regressions = []
if (lostPackages.length)
  regressions.push(`${lostPackages.length} files under packages/** disappeared`)
if (current.nodeModulesDirectoryCount < before.nodeModulesDirectoryCount)
  regressions.push(
    `${before.nodeModulesDirectoryCount - current.nodeModulesDirectoryCount} node_modules directories disappeared`
  )
if (before.binDirectory && !current.binDirectory) regressions.push('node_modules/.bin disappeared')
if (current.deletedCount > before.deletedCount)
  regressions.push(`${current.deletedCount - before.deletedCount} new deleted tracked files`)

if (lostPackages.length) {
  console.log('\nMissing under packages/:')
  for (const path of lostPackages.slice(0, 40)) console.log(`  ${path}`)
  if (lostPackages.length > 40) console.log(`  … and ${lostPackages.length - 40} more`)
}
if (appeared.length) {
  console.log('\nNew git status lines:')
  for (const line of appeared.slice(0, 40)) console.log(`  ${line}`)
}
if (disappeared.length) {
  console.log('\nCleared git status lines:')
  for (const line of disappeared.slice(0, 40)) console.log(`  ${line}`)
}

if (regressions.length) {
  console.log('\nREGRESSION during the run:')
  for (const item of regressions) console.log(`  - ${item}`)
  process.exit(1)
}
console.log('\nNo destruction detected between the two snapshots.')
