import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { readDraUpdateDeployment } from './deployment-config'
import { APP } from '../../shared/app-config'

const host = ['statics', 'aipoch.com'].join('.')
const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '../../..')

const walk = (dir: string): string[] => {
  const hits: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      hits.push(...walk(path))
      continue
    }
    if (!entry.isFile() || !statSync(path).isFile()) continue
    if (readFileSync(path, 'utf8').includes(host)) {
      hits.push(relative(repoRoot, path).split('\\').join('/'))
    }
  }
  return hits
}

// Files that mention the host only to refuse it.
const REJECTION_FILES = [
  'src/main/prerelease/lockdown.test.ts',
  'src/main/update/upstream-test-build.test.ts',
  'src/shared/dra-update-deployment.test.ts',
  'src/shared/dra-update-deployment.ts',
  'src/shared/prerelease.test.ts',
  'src/shared/prerelease.ts'
]

// Notebook runtime and marketplace downloads. These are not an application update feed.
const RUNTIME_CDN_FILES = [
  'src/main/notebook/windows-runtime-catalog.json',
  'src/main/skills/marketplace-source.ts',
  'src/main/specialist/marketplace/official-source.test.ts',
  'src/main/specialist/marketplace/official-source.ts',
  'src/shared/app-config.ts'
]

it('rejects an upstream update feed and does not treat enabled: false as a missing file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dra-upstream-'))
  const file = join(dir, 'app-update.yml')
  try {
    writeFileSync(
      file,
      'provider: generic\nurl: https://statics.aipoch.com/medical-research-agent/app/stable\nchannel: latest\nupdaterCacheDirName: medresearch-agent-updater\n'
    )
    expect(() => readDraUpdateDeployment(file)).toThrow()
    writeFileSync(
      file,
      'provider: generic\nurl: http://statics.aipoch.com/medical-research-agent/app/stable\nchannel: latest\n'
    )
    expect(() => readDraUpdateDeployment(file)).toThrow()
    expect(readDraUpdateDeployment(join(dir, 'missing.yml'))).toEqual({ state: 'missing' })
    writeFileSync(file, 'enabled: false\n')
    expect(readDraUpdateDeployment(file)).toEqual({ state: 'disabled' })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

it('does not ship a default update feed', () => {
  expect(APP.update.enabled).toBe(false)
  expect(APP.update.manifestUrl).toBe('')
  const appConfig = readFileSync(join(repoRoot, 'src/shared/app-config.ts'), 'utf8')
  expect(appConfig.slice(appConfig.indexOf('update:'))).not.toContain(host)
  for (const file of [
    'build/doctor-test-config.cjs',
    'src/main/update/deployment-config.ts',
    'build/deployment-pack.cjs'
  ]) {
    expect(readFileSync(join(repoRoot, file), 'utf8')).not.toContain(host)
  }
})

it('keeps the upstream host out of src except rejection checks and the reported runtime CDN', () => {
  const hits = walk(join(repoRoot, 'src')).sort()
  expect(hits).toEqual([...REJECTION_FILES, ...RUNTIME_CDN_FILES].sort())
  for (const file of REJECTION_FILES) {
    const source = readFileSync(join(repoRoot, file), 'utf8')
    expect(source).toContain(host)
    expect(source).toMatch(/toThrow|toBe\(true\)|rejects|hostname ===|host ===/)
  }
})

it('allows an unsigned doctor-test package without an upstream update feed', () => {
  const config = createRequire(import.meta.url)('../../../build/doctor-test-config.cjs')
  expect(config.win.forceCodeSigning).toBe(false)
  expect(config.afterAllArtifactBuild).toBeUndefined()
  expect(config.afterSign).toBeUndefined()
  expect(config.publish).toBeNull()
  expect(config.extraMetadata.version).toBe('0.1.33-unified.1')
})
