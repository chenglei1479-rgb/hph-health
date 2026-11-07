import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_NPM_CI_ARGS,
  GITHUB_ELECTRON_BUILDER_BINARIES_MIRROR,
  GITHUB_ELECTRON_MIRROR,
  npmCiCommand,
  npmCiEnv,
  runNpmCi,
  shouldForceGitHubElectronMirrors
} from './npm-ci.mjs'

describe('npm ci Electron mirror policy', () => {
  it('forces GitHub Electron artifact URLs on GitHub Actions', () => {
    const env = npmCiEnv({
      GITHUB_ACTIONS: 'true',
      PATH: '/usr/bin'
    })

    expect(shouldForceGitHubElectronMirrors({ GITHUB_ACTIONS: 'true' })).toBe(true)
    expect(env.ELECTRON_MIRROR).toBe(GITHUB_ELECTRON_MIRROR)
    expect(env.ELECTRON_BUILDER_BINARIES_MIRROR).toBe(GITHUB_ELECTRON_BUILDER_BINARIES_MIRROR)
    expect(env).not.toHaveProperty('npm_config_electron_mirror')
    expect(env).not.toHaveProperty('npm_config_electron_builder_binaries_mirror')
    expect(env.PATH).toBe('/usr/bin')
  })

  it('preserves caller-provided local mirror environment', () => {
    const env = npmCiEnv({
      ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/',
      PATH: '/usr/bin'
    })

    expect(shouldForceGitHubElectronMirrors({})).toBe(false)
    expect(env.ELECTRON_MIRROR).toBe('https://npmmirror.com/mirrors/electron/')
  })

  it('runs npm ci with the resolved environment and platform command', () => {
    const spawn = vi.fn(() => ({ status: 0 }))

    expect(
      runNpmCi({
        args: ['--prefer-offline'],
        env: { GITHUB_ACTIONS: 'true' },
        platform: 'linux',
        spawn
      })
    ).toBe(0)
    expect(npmCiCommand('linux')).toBe('npm')
    expect(npmCiCommand('win32')).toBe('npm.cmd')
    expect(spawn).toHaveBeenCalledWith(
      'npm',
      ['ci', '--no-audit', '--prefer-offline'],
      expect.objectContaining({
        env: expect.objectContaining({ ELECTRON_MIRROR: GITHUB_ELECTRON_MIRROR }),
        shell: false,
        stdio: 'inherit'
      })
    )
    expect(DEFAULT_NPM_CI_ARGS).toEqual(['--no-audit'])
  })

  it('retries a failed Windows GitHub Actions install once after a short delay', () => {
    const spawn = vi.fn().mockReturnValueOnce({ status: 1 }).mockReturnValueOnce({ status: 0 })
    const sleep = vi.fn()

    expect(
      runNpmCi({
        env: { GITHUB_ACTIONS: 'true' },
        platform: 'win32',
        sleep,
        spawn
      })
    ).toBe(0)
    expect(spawn).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(sleep).toHaveBeenCalledWith(5_000)
  })

  it('does not retry a failed install outside Windows GitHub Actions', () => {
    const spawn = vi.fn(() => ({ status: 1 }))
    const sleep = vi.fn()

    expect(
      runNpmCi({
        env: { GITHUB_ACTIONS: 'true' },
        platform: 'linux',
        sleep,
        spawn
      })
    ).toBe(1)
    expect(
      runNpmCi({
        env: {},
        platform: 'win32',
        sleep,
        spawn
      })
    ).toBe(1)
    expect(spawn).toHaveBeenCalledTimes(2)
    expect(sleep).not.toHaveBeenCalled()
  })

  // #213 review: the previous matcher was anchored to `^\s+run:\s*(npm ci.*)$`, so an install inside a
  // `run: |` block was invisible - runtime-packages.yml ran `npm ci` with no `--install-links` and the
  // guard never looked at that file. Scanning the text of every workflow and action for the install
  // tokens and comparing the complete set against this inventory means a new, moved or edited install
  // command is red until a person reviews it. The count is derived from the list, not typed twice.
  describe('install commands under .github', () => {
    const REVIEWED: Array<{ file: string; command: string; verdict: string }> = [
      {
        file: 'actions/verify-packages/action.yml',
        command: 'run: node scripts/ci/npm-ci.mjs',
        verdict:
          'no-links-needed: each verifier packs a package into a temporary isolated install, so the root node_modules layout does not decide the result'
      },
      {
        file: 'workflows/dra-mac-pilot.yml',
        command: 'run: node scripts/ci/npm-ci.mjs --install-links',
        verdict: 'linked'
      },
      {
        file: 'workflows/dra-mac-verify.yml',
        command: 'run: node scripts/ci/npm-ci.mjs --install-links',
        verdict: 'linked'
      },
      {
        file: 'workflows/linux-cli-packages.yml',
        command:
          'run: npm ci --install-links --ignore-scripts --omit=optional --no-audit --no-fund',
        verdict: 'linked'
      },
      {
        file: 'workflows/main-installer-build.yml',
        command: 'run: node scripts/ci/npm-ci.mjs --install-links',
        verdict: 'linked'
      },
      {
        file: 'workflows/native-components.yml',
        command: 'run: npm ci --ignore-scripts --no-audit --no-fund',
        verdict:
          'exception #220: sourceFingerprint() hashes this whole workflow file, so adding the flag here invalidates every vendored native binary; the flag is intentionally absent until the fingerprint covers compile inputs only'
      },
      {
        file: 'workflows/package-test-policy-dry-run.yml',
        command: '- run: node scripts/ci/npm-ci.mjs',
        verdict:
          'no-links-needed: the job runs manifest- and git-reading CI tests, which import no @aipoch package, so symlinked file: dependencies change nothing'
      },
      {
        file: 'workflows/pr-unit-tests.yml',
        command: 'run: node scripts/ci/npm-ci.mjs --install-links',
        verdict: 'linked'
      },
      {
        file: 'workflows/pr-unit-tests.yml',
        command: 'run: node scripts/ci/npm-ci.mjs --install-links',
        verdict: 'linked'
      },
      {
        file: 'workflows/pr-unit-tests.yml',
        command: 'run: node scripts/ci/npm-ci.mjs --install-links',
        verdict: 'linked'
      },
      {
        file: 'workflows/pr-unit-tests.yml',
        command: 'run: node scripts/ci/npm-ci.mjs --install-links',
        verdict: 'linked'
      },
      {
        file: 'workflows/pr-unit-tests.yml',
        command: 'run: node scripts/ci/npm-ci.mjs --install-links',
        verdict: 'linked'
      },
      {
        file: 'workflows/prerelease.yml',
        command: 'run: node scripts/ci/npm-ci.mjs --install-links',
        verdict: 'linked'
      },
      {
        file: 'workflows/runtime-packages.yml',
        command: 'npm ci --ignore-scripts --no-audit --no-fund',
        verdict:
          'no-links-needed: the job builds packages immediately after installing - build:packages replaces any packed copy with a link to packages/ (linkPackedFileDependencies) and stage-backend resolves each dependency through realpath with dereference:true, so neither install shape changes the artifact'
      },
      {
        file: 'workflows/test-tree-isolation.yml',
        command: 'run: node scripts/ci/npm-ci.mjs --install-links',
        verdict: 'linked'
      },
      {
        file: 'workflows/windows-runtime-cdn.yml',
        command: 'run: npm ci --install-links --ignore-scripts --no-audit --no-fund',
        verdict: 'linked'
      }
    ]

    const INSTALL_TOKEN = /\bnpm ci\b|scripts\/ci\/npm-ci\.mjs/u
    const inventoryKey = (entry: { file: string; command: string }): string =>
      `${entry.file}\u0000${entry.command}`

    const collectInstallCommands = (): Array<{ file: string; command: string }> => {
      const root = join(process.cwd(), '.github')
      const files: string[] = []
      const walk = (directory: string): void => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          const path = join(directory, entry.name)
          if (entry.isDirectory()) walk(path)
          else if (/\.ya?ml$/u.test(entry.name)) files.push(path)
        }
      }
      walk(root)
      const found: Array<{ file: string; command: string }> = []
      for (const path of files.sort()) {
        for (const line of readFileSync(path, 'utf8').split('\n')) {
          const command = line.trim()
          // Prose that mentions an install is not an install; editing a comment must not require an
          // inventory review, and a command hidden in a comment executes nothing.
          if (command.startsWith('#') || !INSTALL_TOKEN.test(command)) continue
          found.push({ file: relative(root, path).split('\\').join('/'), command })
        }
      }
      return found.sort((left, right) => inventoryKey(left).localeCompare(inventoryKey(right)))
    }

    it('matches the reviewed inventory exactly', () => {
      const reviewed = [...REVIEWED].sort((left, right) =>
        inventoryKey(left).localeCompare(inventoryKey(right))
      )
      expect(collectInstallCommands()).toEqual(
        reviewed.map(({ file, command }) => ({ file, command }))
      )
    })

    it('every reviewed command either passes --install-links or records why it does not need to', () => {
      for (const { file, command, verdict } of REVIEWED) {
        expect(command, file).not.toContain('\r')
        if (verdict === 'linked') {
          expect(command, file).toContain('--install-links')
          continue
        }
        expect(verdict, file).toMatch(/^(no-links-needed|exception #\d+): \S/)
        expect(verdict.length, file).toBeGreaterThan(60)
      }
      // Direct `npm ci` calls bypass the mirror helper, so they must at least skip lifecycle scripts
      // and the audit; the helper adds both itself.
      for (const { file, command, verdict } of REVIEWED) {
        if (!command.includes('npm ci') || verdict !== 'linked') continue
        expect(command, file).toContain('--ignore-scripts')
        expect(command, file).toContain('--no-audit')
      }
    })

    it('keeps the one flagless native-components install tied to #220', () => {
      const exceptions = REVIEWED.filter((entry) => entry.verdict.startsWith('exception'))
      expect(exceptions.map((entry) => entry.file)).toEqual(['workflows/native-components.yml'])
      expect(exceptions[0].verdict).toContain('#220')
    })
  })
})
