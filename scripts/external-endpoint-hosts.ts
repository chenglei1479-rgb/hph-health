import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SOURCE_ROOTS = ['src/main', 'src/shared', 'src/renderer/src', 'src/preload']
const MODEL_FILES = new Set([
  'src/shared/provider-registry.ts',
  'src/shared/enterprise-model-presets.ts'
])
const HOST_PATTERN = /https?:\/\/([A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,})/g

export const isIgnoredOutboundHost = (host: string): boolean => {
  const value = host.toLowerCase().replace(/\.$/, '')
  if (value === 'localhost' || value.endsWith('.localhost')) return true
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return true
  if (value.endsWith('.local') || value.endsWith('.invalid')) return true
  if (value === 'example' || value.endsWith('.example') || value.includes('.example.')) return true
  if (value.endsWith('.test')) return true
  if (value.split('.').includes('example')) return true
  return false
}

const walk = (directory: string, files: string[]): void => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (
        entry.name === 'node_modules' ||
        entry.name === 'fixtures' ||
        entry.name === '__fixtures__'
      )
        continue
      walk(path, files)
      continue
    }
    if (!/\.(ts|tsx|js|cjs|mjs)$/.test(entry.name)) continue
    if (/\.test\.|\.spec\./.test(entry.name)) continue
    files.push(path)
  }
}

export type OutboundHostHit = { host: string; files: string[] }

export const collectOutboundHosts = (root: string): OutboundHostHit[] => {
  const files: string[] = []
  for (const sourceRoot of SOURCE_ROOTS) {
    const directory = join(root, sourceRoot)
    try {
      if (!statSync(directory).isDirectory()) continue
    } catch {
      continue
    }
    walk(directory, files)
  }
  const hits = new Map<string, Set<string>>()
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(HOST_PATTERN)) {
      const host = match[1]?.toLowerCase().replace(/\.$/, '')
      if (!host || isIgnoredOutboundHost(host)) continue
      const relativePath = relative(root, file).split('\\').join('/')
      const current = hits.get(host) ?? new Set<string>()
      current.add(relativePath)
      hits.set(host, current)
    }
  }
  return [...hits.entries()]
    .map(([host, fileSet]) => ({ host, files: [...fileSet].sort() }))
    .sort((left, right) => left.host.localeCompare(right.host))
}

export const isModelCatalogHost = (hit: OutboundHostHit): boolean =>
  hit.files.every((file) => MODEL_FILES.has(file))
