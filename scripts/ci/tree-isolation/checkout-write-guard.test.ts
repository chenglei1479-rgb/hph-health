// #156: test runs wrote into the checkout and one of them destroyed 3328 tracked files under
// packages/**. The ticket ruled out the two popular explanations, so this file does not re-derive the
// cause. It guards the invariant that made those incidents possible: a test may use the OS temporary
// directory as scratch space, never the checkout it is running in.
//
// The scan is textual and deliberately narrow. A broad rule such as "no process.cwd() in tests" would
// flag dozens of legitimate read-only uses and would be worked around instead of followed. What is
// banned here is the shape that actually left files behind: a *root the code creates inside* the
// checkout, and an npm install of a local path that names no destination.
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const SCAN_ROOTS = ['src', 'packages', 'scripts', 'test', 'e2e']
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'out',
  'coverage',
  '.git',
  '.scratch',
  '.worktree',
  '.worktrees',
  'tmp'
])

const testFiles = (): string[] => {
  const files: string[] = []
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (/\.test\.(?:ts|tsx)$/u.test(entry.name)) files.push(path)
    }
  }
  for (const root of SCAN_ROOTS) visit(join(repoRoot, root))
  return files
}

type CodeLine = { number: number; text: string; file: string }

// `//` and `*` lines are not code: a comment may describe the old shape without recreating it. That is
// also how a reader finds the reason a rule exists.
const codeLines = (file: string): CodeLine[] =>
  readFileSync(file, 'utf8')
    .split(/\r?\n/u)
    .map((text, index) => ({ number: index + 1, text: text.trim(), file }))
    .filter(
      ({ text }) =>
        text.length > 0 && !text.startsWith('//') && !text.startsWith('*') && !text.startsWith('/*')
    )

// The scan reads every test source once and reuses the lines: three rules each walking the tree made a
// single test exceed Vitest's default timeout under parallel load, which read as a guard failure
// instead of a slow guard.
const code: CodeLine[] = testFiles().flatMap(codeLines)

const offenders = (matches: (text: string) => boolean): string[] =>
  code
    .filter(({ text }) => matches(text))
    .map(({ file, number, text }) => `${relative(repoRoot, file).split('\\').join('/')}:${number}: ${text}`)

// Assembled from parts so this file does not match its own needles: the guard scans every test source,
// including this one, and must not need an exemption for itself.
const LEGACY_RUNTIME_MARKER = ['.open-science', 'test-runtime'].join('-')
const LEGACY_SCRATCH_MARKER = ['.scratch', 'vitest-tmp'].join('/')

describe('tests keep their scratch space out of the checkout', () => {
  it('never builds a path inside the checkout for the two markers that leaked into it', () => {
    // Both literals are the directories that appeared in the working tree after test runs.
    expect([
      ...offenders((text) => text.includes(LEGACY_RUNTIME_MARKER)),
      ...offenders((text) => text.includes(LEGACY_SCRATCH_MARKER))
    ]).toEqual([])
  })

  it('never hands the checkout to a runtime root or creates a directory there', () => {
    expect(
      [
        ...offenders((text) => /runtimeRoot\s*:\s*process\.cwd\(\)/u.test(text)),
        ...offenders((text) => /runtimeRoot\s*:\s*join\(\s*process\.cwd\(\)/u.test(text)),
        ...offenders((text) => /(?:mkdir|mkdirSync|mkdtemp|mkdtempSync)\(\s*join\(\s*process\.cwd\(\)/u.test(text))
      ].filter(Boolean)
    ).toEqual([])
  })

  it('names an explicit destination for every npm install of a local path', () => {
    // An install that inherits the checkout rewrites node_modules and package-lock.json there. A local
    // path install (`install [ -g ] ./pkg`) is the shape the notebook suites use, so it must carry its
    // own `--prefix`; the repository root is then never an install target, even if the command is
    // interrupted.
    const unfenced = code.filter(
      ({ text }) => /install\s+(?:-g\s+)?\.\//u.test(text) && !text.includes('--prefix')
    )
    expect(
      unfenced.map(
        ({ file, number, text }) => `${relative(repoRoot, file).split('\\').join('/')}:${number}: ${text}`
      )
    ).toEqual([])
  })
})

describe('the tree-isolation guard is wired into CI', () => {
  const workflow = readFileSync(
    fileURLToPath(new URL('../../../.github/workflows/test-tree-isolation.yml', import.meta.url)),
    'utf8'
  )

  it('snapshots the tree around the guard run', () => {
    expect(workflow).toContain('scripts/ci/pkg-suite-snapshot.mjs before')
    // The `if: always()` has to belong to the comparison step itself. A loose `toContain` stayed green
    // after moving it to another step or deleting it from this one, which is exactly how the guard would
    // silently lose "a red guard still reports a destroyed tree": anchor the two lines together.
    expect(workflow).toMatch(
      /if: always\(\)\s*\n\s*run: node scripts\/ci\/pkg-suite-snapshot\.mjs after/u
    )
    // A destroyed tree that is allowed to continue is not guarded: the comparison step must be able to
    // fail the job.
    expect(workflow).not.toContain('continue-on-error')
  })

  it('runs the guard by directory and requires real execution', () => {
    expect(workflow).toContain('scripts/ci/tree-isolation')
    // A run that matches nothing exits 0: the sentinels are what make a renamed or deleted guard fail.
    expect(workflow).toContain('require-unit-test-results.mjs')
    expect(workflow).toContain('scripts/ci/tree-isolation/pkg-suite-snapshot.test.ts')
    expect(workflow).toContain('scripts/ci/tree-isolation/checkout-write-guard.test.ts')
    expect(workflow).not.toContain('--passWithNoTests')
  })
})
