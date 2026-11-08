import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { classifyChanges, matchesPath } from './classify-pr-changes.mjs'

// #216: a selector that names nothing is the quiet failure this ticket exists for. The rule still
// reads as coverage, fires for nothing, and the next person believes the path is checked. Four
// `src/preload` filename globs described themselves as that directory's Windows coverage while
// matching none of its nine files, and two literal paths outlived their files by a package move.
// Both checks read the tracked tree, so moving a file without updating its selector fails here
// instead of silently dropping a lane.
const manifest = JSON.parse(
  readFileSync(join(process.cwd(), 'scripts/ci/change-impact.json'), 'utf8')
) as { rules: Array<{ id: string; paths: string[] }> }
const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean)
const wildcard = /[*?[\]{}]/u

// A selector whose directory does not exist at all is inert rather than misleading: there is nothing
// under it that could be missed today, and its routing is pinned by the classification tests with
// synthetic paths. `ISSUE_TEMPLATE` is such a case - a GitHub convention this repository removed
// during sanitization (`67d17d57`), kept as an owner rule so adding a template later still runs
// static checks instead of falling through to a full plan. A selector whose directory does exist
// must match something in it; that is the preload glob shape, where the directory was real and the
// claim was not.
const inertSelectors = [
  { entry: 'issue_template: .github/ISSUE_TEMPLATE/*.yml', directory: '.github/ISSUE_TEMPLATE' },
  { entry: 'issue_template: .github/ISSUE_TEMPLATE/*.yaml', directory: '.github/ISSUE_TEMPLATE' }
]

const staticDirectory = (pattern: string): string => {
  const firstWildcard = pattern.search(wildcard)
  const prefix = firstWildcard === -1 ? pattern : pattern.slice(0, firstWildcard)
  const cut = prefix.lastIndexOf('/')
  return cut <= 0 ? '.' : prefix.slice(0, cut)
}

describe('change-impact selectors name real things', () => {
  it('every literal selector exists on disk', () => {
    const missing: string[] = []
    for (const rule of manifest.rules) {
      for (const pattern of rule.paths) {
        if (wildcard.test(pattern)) continue
        if (!existsSync(join(process.cwd(), pattern))) missing.push(`${rule.id}: ${pattern}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('every wildcard selector over an existing directory matches a tracked file', () => {
    const empty: string[] = []
    for (const rule of manifest.rules) {
      for (const pattern of rule.paths) {
        if (!wildcard.test(pattern)) continue
        if (!existsSync(join(process.cwd(), staticDirectory(pattern)))) continue
        if (!tracked.some((path) => matchesPath(path, pattern))) empty.push(`${rule.id}: ${pattern}`)
      }
    }
    expect(empty).toEqual([])
  })

  it('keeps the inert selectors to the directory this repository never adopted', () => {
    const inert: Array<{ entry: string; directory: string }> = []
    for (const rule of manifest.rules) {
      for (const pattern of rule.paths) {
        if (!wildcard.test(pattern)) continue
        const directory = staticDirectory(pattern)
        if (existsSync(join(process.cwd(), directory))) continue
        inert.push({ entry: `${rule.id}: ${pattern}`, directory })
      }
    }
    expect(inert).toEqual(inertSelectors)
  })
})

// The moved files kept their Windows signal by being retargeted. These assertions use the production
// classifier, so they fail if either the selector or the module overlay that backs it changes.
describe('Windows-sensitive routing after the package moves', () => {
  const windowsLanes = [
    'windows_runtime',
    'windows_path',
    'e2e_functional_windows',
    'e2e_workspace_windows'
  ]

  it.each([
    ['package listing', 'packages/environment/src/package-listing.ts'],
    ['file durability', 'packages/durable-files/src/file-durability.ts'],
    ['specialist repository', 'packages/specialists/src/repository.ts']
  ])('keeps the %s Windows signal across the move', (_name, path) => {
    const plan = classifyChanges([{ path, status: 'modified' }])
    expect(plan.roots, path).toContain('windows_sensitive')
    expect(plan.lanes, path).toEqual(expect.arrayContaining(windowsLanes))
    expect(plan.reasonChains, path).toContain(`${path} -> windows_sensitive`)
  })

  it('routes the whole preload directory, not filenames that resemble Windows APIs', () => {
    for (const path of [
      'src/preload/index.ts',
      'src/preload/find-overlay.ts',
      'src/preload/installation-assistant.ts',
      'src/preload/electron-renderer-contract-adapter.ts',
      'src/preload/renderer-api.d.ts'
    ]) {
      const plan = classifyChanges([{ path, status: 'modified' }])
      expect(plan.roots, path).toContain('windows_sensitive')
      expect(plan.lanes, path).toEqual(expect.arrayContaining(windowsLanes))
    }
  })
})
