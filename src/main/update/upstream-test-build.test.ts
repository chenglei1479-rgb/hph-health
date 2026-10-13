import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import { readDraUpdateDeployment } from './deployment-config'
import { APP } from '../../shared/app-config'

it('restores the pinned original feed for this unsigned test build', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dra-upstream-'))
  const file = join(dir, 'app-update.yml')
  try {
    writeFileSync(file, 'provider: generic\nurl: https://statics.aipoch.com/medical-research-agent/app/stable\nchannel: latest\nupdaterCacheDirName: medresearch-agent-updater\n')
    expect(readDraUpdateDeployment(file)).toBeUndefined()
    expect(APP.update.enabled).toBe(true)
    expect(APP.update.manifestUrl).toContain('statics.aipoch.com')
    writeFileSync(file, 'provider: generic\nurl: http://statics.aipoch.com/medical-research-agent/app/stable\nchannel: latest\n')
    expect(() => readDraUpdateDeployment(file)).toThrow()
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

it('allows a test package without a signing identity and restores the upstream feed', () => {
  const config = createRequire(import.meta.url)('../../../build/doctor-test-config.cjs')
  expect(config.win.forceCodeSigning).toBe(false)
  expect(config.afterAllArtifactBuild).toBeUndefined()
  expect(config.afterSign).toBeUndefined()
  expect(config.publish.url).toBe('https://statics.aipoch.com/medical-research-agent/app/stable')
  expect(config.extraMetadata.version).toBe('0.1.31-test.2')
})
