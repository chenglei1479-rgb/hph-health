import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const script = fileURLToPath(new URL('./pkg-suite-snapshot.mjs', import.meta.url))
const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const tree = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'pkg-snapshot-'))
  roots.push(root)
  mkdirSync(join(root, 'packages', 'a', 'src'), { recursive: true })
  writeFileSync(join(root, 'packages', 'a', 'src', 'index.ts'), 'export {}\n')
  mkdirSync(join(root, 'node_modules', 'vitest'), { recursive: true })
  mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true })
  return root
}

const run = (root: string, mode: 'before' | 'after') =>
  spawnSync(process.execPath, [script, mode, '--root', root, '--state', join(root, 'state.json')], {
    encoding: 'utf8'
  })

describe('pkg-suite-snapshot', () => {
  it('reports no destruction when nothing changed', () => {
    const root = tree()
    expect(run(root, 'before').status).toBe(0)
    const after = run(root, 'after')
    expect(after.status).toBe(0)
    expect(after.stdout).toContain('No destruction detected between the two snapshots.')
  })

  // The self-test is the tool's own reverse proof: a hidden deletion must fail the run and name the
  // path, which is exactly what we needed and lacked when 3328 files vanished overnight.
  it('fails and names the path when a package file disappears', () => {
    const root = tree()
    expect(run(root, 'before').status).toBe(0)
    rmSync(join(root, 'packages', 'a', 'src', 'index.ts'))
    const after = run(root, 'after')
    expect(after.status).toBe(1)
    expect(after.stdout).toContain('REGRESSION during the run:')
    expect(after.stdout).toContain('packages/a/src/index.ts')
  })

  it('fails when the dependency bin links disappear', () => {
    const root = tree()
    expect(run(root, 'before').status).toBe(0)
    rmSync(join(root, 'node_modules', '.bin'), { recursive: true, force: true })
    const after = run(root, 'after')
    expect(after.status).toBe(1)
    expect(after.stdout).toContain('node_modules/.bin disappeared')
  })

  it('refuses to compare without a recorded snapshot', () => {
    const root = tree()
    const after = run(root, 'after')
    expect(after.status).toBe(2)
    expect(after.stderr).toContain('No snapshot recorded')
  })
})
