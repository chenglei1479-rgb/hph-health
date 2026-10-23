import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createFetchBundleAdapter } from '../../packages/environment/src/language-pack-fetch'
import { collectHosts, hostsInText } from './egress-hosts.mjs'
import { stageNativeComponents } from '../native-components.mjs'
import { SkillMarketplaceService } from '../../src/main/skill-marketplace/service'
import { MarketplaceService } from '../../src/main/specialist/marketplace/service'

const root = resolve(__dirname, '../..')
const fromRoot = (path: string): string => readFileSync(join(root, path), 'utf8')

// Every remaining reference is reviewed and temporary. The list may only shrink; adding a file
// here requires a fresh review and an explicit reason in the PR.
const ALLOWED_UPSTREAM_FILES = {
  // Build-time metadata whose sha256 is pinned. Changing cdn/url invalidates the signed release
  // fingerprint, so these stay until Native Components is re-published (needs Leo).
  'build/native-components.json': 'metadata only; stageNativeComponents verifies vendored bytes',
  'build/native-components-lock.json': 'metadata only; sha256/size trust anchor',
  // Temporary default for R1/R2 while no Baselio-hosted CDN exists. Remove when Leo supplies one.
  'build/runtime-cdn.json': 'temporary build-time default; empty BASELIO_RUNTIME_CDN_BASE disables',
  // B2: mac-pilot workflow needs a URL until the hosted runtime bundle exists; workflow cannot change.
  'scripts/verify-runtime-bundle.mjs': 'B2; workflow still invokes the CDN check',
  // Official marketplaces stay default-on during beta (Leo, 2026-10-17). The disable switch makes
  // them configurable without changing the default.
  'src/main/skill-marketplace/source.ts': 'default-on official Skill marketplace source',
  'src/main/specialist/marketplace/official-source.ts': 'default-on official Specialist source',
  'src/shared/skill-marketplace.ts': 'settings link for the default-on Skill marketplace',
  // User-facing disclosure of the runtime/package destinations, and the generated endpoint doc.
  'src/renderer/src/pages/home/external-destinations.ts': 'home Details disclosure',
  'src/shared/outbound-endpoints.ts': 'generated docs/external-endpoints.md',
  // License/repository metadata and prose, never a runtime request.
  'build/deb-copyright': 'license metadata',
  'packages/open-science/package.json': 'package repository metadata',
  'scripts/linux-cli-packages.mjs': 'package docs and repository metadata',
  'scripts/runtime-archives.mjs': 'standalone archive README text',
  'src/main/skill-marketplace/protocol.ts': 'protocol provenance comment',
  // Rejection lists: these are protective, not request destinations.
  'src/shared/prerelease.ts': 'beta reject list',
  'src/shared/dra-update-deployment.ts': 'update deployment reject list'
} as const

const ALLOWED = new Set(Object.keys(ALLOWED_UPSTREAM_FILES))
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.yml', '.yaml'])

const productionFiles = (directory = root): string[] => {
  const found: string[] = []
  for (const entry of readdirSync(directory)) {
    if (['.git', 'node_modules', 'out', 'dist'].includes(entry)) continue
    const absolute = join(directory, entry)
    const info = statSync(absolute)
    if (info.isDirectory()) {
      found.push(...productionFiles(absolute))
      continue
    }
    if (!EXTENSIONS.has(entry.slice(entry.lastIndexOf('.')))) {
      // build/deb-copyright is plain text without an extension and carries a repository URL.
      if (entry === 'deb-copyright' && directory.endsWith('build')) {
        found.push(relative(root, absolute).replaceAll('\\', '/'))
      }
      continue
    }
    const path = relative(root, absolute).replaceAll('\\', '/')
    if (path.startsWith('docs/') || path.startsWith('e2e/') || path.startsWith('test/')) continue
    if (
      path.includes('/locales/') ||
      path.includes('/fixtures/') ||
      path.includes('/__fixtures__/')
    )
      continue
    if (/\.(test|spec)\.(ts|tsx|js|mjs|cjs)$/.test(path)) continue
    found.push(path)
  }
  return found
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('no new upstream AIPOCH hosts', () => {
  it('keeps the statics.aipoch.com reference set at the reviewed exceptions', () => {
    const hosts = collectHosts({ root })
    expect(
      hosts
        .get('statics.aipoch.com')
        ?.map((path) => path.replaceAll('\\', '/'))
        .sort()
    ).toEqual([
      'build/native-components-lock.json',
      'build/native-components.json',
      'build/runtime-cdn.json',
      'scripts/verify-runtime-bundle.mjs',
      'src/main/skill-marketplace/source.ts',
      'src/main/specialist/marketplace/official-source.ts'
    ])
  })

  it('keeps every file that names AIPOCH or an aipoch GitHub repository on the exception list', () => {
    const files = productionFiles().filter((path) => {
      const text = fromRoot(path)
      return (
        /aipoch\.(?:com|cn|ai)/i.test(text) ||
        /github(?:usercontent)?\.com\/aipoch/i.test(text) ||
        /aipoch\/openscience/i.test(text)
      )
    })
    expect(files.sort()).toEqual([...ALLOWED].sort())
  })

  it('does not let a URL-only scan hide a new bare host', () => {
    for (const path of productionFiles()) {
      const text = fromRoot(path)
      for (const host of hostsInText(text)) {
        if (host.endsWith('aipoch.com')) expect(ALLOWED.has(path)).toBe(true)
      }
    }
  })

  it('keeps the beta and updater reject lists in their guarded branches', () => {
    expect(fromRoot('src/shared/prerelease.ts')).toMatch(
      /if \(host === 'statics\.aipoch\.com'\) return true/
    )
    expect(fromRoot('src/shared/dra-update-deployment.ts')).toMatch(
      /url\.hostname === 'statics\.aipoch\.com'/
    )
  })
})

describe('disabled downloads fail closed without a request', () => {
  it('stages native components from the repository vendor copy without fetching', async () => {
    const fetchImpl = vi.fn(() => {
      throw new Error('stageNativeComponents must not fetch in the default build')
    })
    const release = await stageNativeComponents({ directory: root, fetchImpl })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(release.files).toHaveLength(5)
  })

  it('returns disabled from R1 without touching the network', async () => {
    const fetchText = vi.fn()
    const download = vi.fn()
    const onProgress = vi.fn()
    const adapter = createFetchBundleAdapter('/unused', '', { fetchText, download })
    await expect(
      adapter({ name: 'python', language: 'python', version: '3.11' } as never, 1, onProgress)
    ).resolves.toBeUndefined()
    expect(fetchText).not.toHaveBeenCalled()
    expect(download).not.toHaveBeenCalled()
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        event: { code: 'runtime-cdn-disabled' }
      })
    )
  })

  it('returns disabled from R3 without touching the network', async () => {
    const fetchImpl = vi.fn()
    const service = new SkillMarketplaceService(fetchImpl, null)
    await expect(service.list()).resolves.toEqual({ ok: false, error: 'disabled' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns disabled from R5 without touching the network', async () => {
    const fetchImpl = vi.fn()
    const service = new MarketplaceService({
      repository: {
        getAll: async () => ({ sources: [], installations: [], pendingInstallations: [] })
      },
      packages: {},
      fetch: fetchImpl,
      officialSource: undefined,
      getInstalledSpecialists: async () => [],
      setSkillsMainEnabled: async () => undefined
    } as never)
    await expect(service.list()).resolves.toMatchObject({
      sources: [],
      specialists: [],
      failures: [],
      disabled: true
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
