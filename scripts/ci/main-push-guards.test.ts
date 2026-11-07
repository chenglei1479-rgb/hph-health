import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'

// #208: a plain merge into main ran no check at all. Every workflow below was pull-request-only, so
// the commit main actually received was never tested and a broken main only showed up at the next beta
// tag. Adding `push: branches: [main]` is one line per file and one line is easy to delete again, so
// this suite pins the decision instead of the review comment that made it.
//
// A new workflow that runs on pull requests should be considered for this list. It is written out
// rather than derived on purpose: the question "should this run on main?" needs a person to answer it,
// and a derived list would answer it silently.
const GUARDED = [
  'i18n-guard.yml',
  'test-tree-isolation.yml',
  'pr-unit-tests.yml',
  'jp-phi-eval.yml',
  'supply-chain.yml',
  'main-installer-build.yml'
] as const

type Job = {
  steps?: Array<Record<string, unknown>>
  strategy?: { matrix?: { include?: Array<Record<string, string>> } }
}

type Workflow = {
  on?: Record<string, unknown>
  permissions?: Record<string, string>
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean | string }
  jobs?: Record<string, Job>
}

const root = join(process.cwd(), '.github', 'workflows')
const readText = (file: string): string => readFileSync(join(root, file), 'utf8')
const readWorkflow = (file: string): Workflow => load(readText(file)) as Workflow
const runsOf = (file: string): string[] =>
  Object.values(readWorkflow(file).jobs ?? {})
    .flatMap((job) => job.steps ?? [])
    .map((step) => String(step.run ?? ''))

describe('main push guards', () => {
  it.each(GUARDED)('%s runs on a push to main', (file) => {
    const push = readWorkflow(file).on?.push as { branches?: string[] } | undefined
    expect(push?.branches).toContain('main')
  })

  // A pull-request-only context would be empty on a push. The two concurrency groups read
  // `github.event.pull_request.number` on purpose: it is followed by `|| github.ref`, which is what
  // keeps a main push out of the pull-request groups instead of collapsing them.
  it.each(GUARDED)('%s reads no pull-request context without a fallback', (file) => {
    const lines = readText(file)
      .split(/\r?\n/)
      .filter((line) => /github\.(?:event\.pull_request\.|head_ref|base_ref)/u.test(line))
    for (const line of lines) expect(line).toMatch(/\|\|\s*github\.ref/u)
  })

  it.each(['test-tree-isolation.yml', 'pr-unit-tests.yml'])(
    '%s keeps main pushes and pull requests in separate concurrency groups',
    (file) => {
      const group = readWorkflow(file).concurrency?.group ?? ''
      expect(group).toContain('github.event.pull_request.number || github.ref')
    }
  )

  // #208 and #206 both say the main-push build must not publish. Enforced by shape: read-only token,
  // no release step, no upload, and exactly one packaging command that uses the unsigned config.
  it('packages the Windows installer on main without any way to publish it', () => {
    const file = 'main-installer-build.yml'
    const workflow = readWorkflow(file)
    const text = readText(file)

    expect(workflow.permissions?.contents).toBe('read')
    expect(text).not.toMatch(/contents:\s*write/u)
    expect(text).not.toMatch(/gh release|upload-artifact|npm publish|action-gh-release/u)
    expect(runsOf(file).filter((run) => run.includes('electron-builder'))).toEqual([
      'npx electron-builder --config build/prerelease-electron-builder.cjs --win nsis --x64'
    ])
  })

  // A main push has no tag, so there is nothing to derive a version from and nothing to publish it as.
  // `npm version` in this workflow would rewrite package.json mid-build and change the artifact name;
  // the release workflow owns that, on a tag.
  it('does not bump the version on a main push', () => {
    const offending = runsOf('main-installer-build.yml').filter((run) =>
      /npm\s+version/u.test(run)
    )
    expect(offending).toEqual([])
    // The build must not read a release tag it never has.
    expect(readText('main-installer-build.yml')).not.toMatch(/DRA_RELEASE_TAG|inputs\.tag/u)
  })

  // CTO review on #210: this workflow is a copy of the `win` row in `prerelease.yml`, so the packaging
  // command has to be the same one. Otherwise `prerelease.yml` can gain a required flag (or change the
  // config file) and the main-push guard keeps testing a pipeline that no longer exists - green, and
  // about nothing. Rendering the matrix row makes the comparison exact instead of "both mention nsis".
  it('runs the same packaging command as the Windows prerelease build', () => {
    const prerelease = readWorkflow('prerelease.yml')
    const buildJob = prerelease.jobs?.build
    expect(buildJob).toBeDefined()

    const winRow = buildJob?.strategy?.matrix?.include?.find((row) => row.os === 'windows-latest')
    expect(winRow, 'prerelease.yml has no windows-latest matrix row').toBeDefined()

    const template = (buildJob?.steps ?? [])
      .map((step) => String(step.run ?? ''))
      .find((run) => run.includes('electron-builder'))
    expect(template, 'the prerelease build has no electron-builder command').toBeDefined()

    const rendered = template!.replace(
      /\$\{\{\s*matrix\.(\w+)\s*\}\}/gu,
      (_match, key: string) => String(winRow?.[key] ?? `missing-matrix-value:${key}`)
    )
    expect(rendered).toContain('build/prerelease-electron-builder.cjs')
    expect(runsOf('main-installer-build.yml').filter((run) => run.includes('electron-builder'))).toEqual(
      [rendered]
    )
  })
})
