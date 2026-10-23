import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { TFunction } from 'i18next'
import { describe, expect, it } from 'vitest'

import { AUTOMATIC_PACKAGE_MIRROR_CANDIDATES, CURATED_MIRRORS } from '../../src/shared/mirror'
import { homeExternalDestinationLines } from '../../src/renderer/src/pages/home/external-destinations'

const root = resolve(__dirname, '../..')
const read = (path: string): string => readFileSync(join(root, path), 'utf8')
const identity = ((key: string) => key) as unknown as TFunction

const hostsInText = (text: string): string[] =>
  [...text.matchAll(/https?:\/\/([^/\s"'`]+)/g)].map((match) => match[1]!.toLowerCase())

const catalogUrls = (value: unknown): string[] => {
  if (typeof value === 'string') return /^https?:\/\//.test(value) ? [value] : []
  if (Array.isArray(value)) return value.flatMap(catalogUrls)
  if (value && typeof value === 'object') return Object.values(value).flatMap(catalogUrls)
  return []
}

// The three runtime/package sources named in the brief plus the marketplace, registry, and mirror
// destinations disclosed during the transitional period.
const REQUIRED_HOSTS = [
  'statics.aipoch.com',
  'conda.anaconda.org',
  'pypi.org',
  'cloud.r-project.org',
  'mirrors.tuna.tsinghua.edu.cn',
  'mirrors.ustc.edu.cn',
  'mirrors.aliyun.com',
  'registry.npmjs.org',
  'registry.npmmirror.com',
  'github.com',
  'api.github.com',
  'raw.githubusercontent.com'
]

describe('external destination disclosure', () => {
  it('derives the runtime CDN and package hosts from the shipped configuration', () => {
    const native = JSON.parse(read('build/native-components.json')) as { cdn: string }
    expect(new URL(native.cdn).hostname).toBe('statics.aipoch.com')

    const windows = JSON.parse(read('src/main/notebook/windows-runtime-catalog.json')) as unknown
    // The catalog stores relative paths; the build supplies the host. An absolute URL here would
    // require a new disclosure entry and fails until the catalog is fixed.
    expect(catalogUrls(windows)).toEqual([])

    const packageUrls = AUTOMATIC_PACKAGE_MIRROR_CANDIDATES.flatMap((candidate) => [
      candidate.probeUrl,
      candidate.biocondaProbeUrl,
      candidate.mirror.condaChannel,
      candidate.mirror.pypiIndex,
      candidate.mirror.cranMirror
    ]).filter((value): value is string => Boolean(value))
    const packageHosts = new Set(packageUrls.flatMap(hostsInText))
    for (const host of [
      'conda.anaconda.org',
      'mirrors.tuna.tsinghua.edu.cn',
      'mirrors.ustc.edu.cn',
      'mirrors.aliyun.com'
    ]) {
      expect(packageHosts.has(host)).toBe(true)
    }
    expect(new URL(CURATED_MIRRORS.cn.pypiIndex).hostname).toBe('pypi.tuna.tsinghua.edu.cn')
  })

  it('lists every required host in docs/external-endpoints.md and the home Details list', () => {
    const docs = read('docs/external-endpoints.md')
    const home = homeExternalDestinationLines(identity).join('\n')
    for (const host of REQUIRED_HOSTS) {
      expect(docs).toContain(host)
      expect(home).toContain(host)
    }
  })

  it('documents the zh-Hans-only condition for mainland mirrors', () => {
    const docs = read('docs/external-endpoints.md')
    expect(docs).toMatch(/Only when the app language is zh-Hans/i)
    expect(docs).toMatch(/ja, en, and every non-zh-Hans locale never probe/i)
  })
})
