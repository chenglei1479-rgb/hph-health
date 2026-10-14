import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { runInNewContext } from 'node:vm'
import path from 'node:path'
import { load } from 'js-yaml'
import { expect, it } from 'vitest'
import { APP } from '../src/shared/app-config'

it('skips publisher verification for an unsigned prerelease package', async () => {
  const exports: { default?: (context: { artifactPaths: string[] }) => Promise<string[]> } = {}
  const calls: unknown[][] = []
  runInNewContext(readFileSync('build/verify-windows-release.cjs', 'utf8'), {
    exports,
    __dirname: path.resolve('build'),
    process: { env: { DRA_PRERELEASE: '1' } },
    require: () => ({
      execFileSync: (...args: unknown[]) => calls.push(args)
    })
  })
  await expect(
    exports.default!({
      artifactPaths: ['dist/deep-research-agent-0.1.33-beta.1-win-x64-setup.exe']
    })
  ).resolves.toEqual([])
  expect(calls).toEqual([])
})

it('verifies real artifact paths using the electron-builder BuildResult hook contract', async () => {
  const calls: unknown[][] = []
  const exports: { default?: (context: { artifactPaths: string[] }) => Promise<string[]> } = {}
  const projectBuild = path.resolve('build')
  runInNewContext(readFileSync('build/verify-windows-release.cjs', 'utf8'), {
    exports,
    __dirname: projectBuild,
    process: { env: { DRA_SIGNING_PUBLISHER: 'DRA Test' } },
    require: (name: string) =>
      name === 'node:path'
        ? path
        : {
            execFileSync: (...args: unknown[]) => calls.push(args)
          }
  })
  const installer = path.resolve('dist/deep-research-agent-0.1.29-win-x64-setup.exe')
  await exports.default!({ artifactPaths: [installer] })
  expect(calls).toHaveLength(1)
  expect(calls[0][0]).toBe('powershell.exe')
  expect(calls[0][1]).toEqual(
    expect.arrayContaining([
      path.join(projectBuild, 'verify-windows-release.ps1'),
      installer,
      path.resolve('dist/win-unpacked/medresearch-agent.exe'),
      'DRA Test'
    ])
  )
})

it('does not ship a default update feed or manifest', () => {
  const config = load(readFileSync('electron-builder.yml', 'utf8')) as { publish: unknown }
  expect(config.publish).toBeNull()
  expect(APP.update.enabled).toBe(false)
  expect(APP.update.manifestUrl).toBe('')
})

it('rejects Windows releases without a signing identity before compiling', () => {
  const env = { ...process.env, DRA_SIGNING_PUBLISHER: 'DRA Test', CSC_LINK: '', WIN_CSC_LINK: '' }
  const result = spawnSync(process.execPath, ['scripts/windows-signing-preflight.cjs'], {
    env,
    encoding: 'utf8'
  })
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('Unsigned release builds are disabled')
})

it('requires signing, update signature checks, and final artifact verification', () => {
  const config = load(readFileSync('electron-builder.yml', 'utf8')) as {
    win: { forceCodeSigning: boolean; verifyUpdateCodeSignature: boolean }
    afterAllArtifactBuild: string
  }
  expect(config.win.forceCodeSigning).toBe(true)
  expect(config.win.verifyUpdateCodeSignature).toBe(true)
  expect(config.afterAllArtifactBuild).toBe('build/verify-windows-release.cjs')
})
