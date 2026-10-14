import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

import { load } from 'js-yaml'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)

it('builds the internal beta without a signing identity and keeps stable signing required', () => {
  const prerelease = require('./prerelease-electron-builder.cjs') as {
    afterAllArtifactBuild?: string
    dmg: { sign: boolean }
    mac: { identity: null; notarize: boolean }
    publish: null
    win: { forceCodeSigning: boolean }
  }
  const stable = load(readFileSync('electron-builder.yml', 'utf8')) as {
    win: { forceCodeSigning: boolean }
    dmg: { sign: boolean }
    afterAllArtifactBuild: string
  }

  expect(prerelease.win.forceCodeSigning).toBe(false)
  expect(prerelease.dmg.sign).toBe(false)
  expect(prerelease.mac.notarize).toBe(false)
  expect(prerelease.mac.identity).toBeNull()
  expect(prerelease.afterAllArtifactBuild).toBeUndefined()
  expect(prerelease.publish).toBeNull()
  expect(stable.win.forceCodeSigning).toBe(true)
  expect(stable.dmg.sign).toBe(true)
  expect(stable.afterAllArtifactBuild).toBe('build/verify-windows-release.cjs')

  const beta = prerelease as {
    extraResources?: Array<{ from: string; to: string }>
    files?: string[]
  }
  expect(beta.files).toContain('!resources/schema-notebook-python{,/**/*}')
  expect(beta.extraResources).toContainEqual({
    from: 'resources/schema-notebook-python',
    to: 'schema-notebook-python'
  })
  const stableRaw = readFileSync('electron-builder.yml', 'utf8')
  expect(stableRaw).not.toContain('schema-notebook-python')
})
