import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { CONNECTOR_CONTACT_EMAIL } from '../../shared/connector-compliance'

// HTML catalogues that are not a stable JSON API. Official APIs (CiNii, J-STAGE, PDC, pheweb /api)
// are preferred where they exist; these hosts still need a polite client for catalogue pages.
export const POLITE_HOSTS = new Set([
  'pheweb.jp',
  'humandbs.dbcls.jp',
  'humandbs.biosciencedbc.jp',
  'jenger.riken.jp'
])

export const POLITE_INTERVAL_MS = 1000
export const POLITE_TTL_MS = 6 * 60 * 60 * 1000

const lastRequestAt = new Map<string, number>()
const memoryCache = new Map<string, { expires: number; body: string; contentType: string }>()

function appVersion(): string {
  const candidates = [
    join(__dirname, '../../../package.json'),
    join(__dirname, '../../package.json'),
    join(process.cwd(), 'package.json')
  ]
  for (const path of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as { version?: string }
      if (parsed.version) return parsed.version
    } catch {
      // Try the next location. Packaged and test layouts differ.
    }
  }
  return '0.0.0'
}

export const CONNECTOR_USER_AGENT = `DRA/${appVersion()} (+${CONNECTOR_CONTACT_EMAIL})`

export function isPoliteHost(hostname: string): boolean {
  return POLITE_HOSTS.has(hostname)
}

export function reservePoliteSlot(
  host: string,
  now = Date.now(),
  intervalMs = POLITE_INTERVAL_MS
): number {
  const previous = lastRequestAt.get(host) ?? 0
  const wait = Math.max(0, previous + intervalMs - now)
  lastRequestAt.set(host, now + wait)
  return wait
}

function cacheKey(url: string): string {
  return createHash('sha256').update(url).digest('hex')
}

function cacheDir(): string {
  return process.env.DRA_CONNECTOR_CACHE_DIR || join(tmpdir(), 'dra-connector-cache')
}

export function readPoliteCache(
  url: string,
  now = Date.now()
): { body: string; contentType: string } | null {
  const key = cacheKey(url)
  const cached = memoryCache.get(key)
  if (cached && cached.expires > now) return { body: cached.body, contentType: cached.contentType }
  try {
    const raw = JSON.parse(readFileSync(join(cacheDir(), `${key}.json`), 'utf8')) as {
      expires?: number
      body?: string
      contentType?: string
    }
    if (
      typeof raw.expires === 'number' &&
      raw.expires > now &&
      typeof raw.body === 'string' &&
      typeof raw.contentType === 'string'
    ) {
      memoryCache.set(key, { expires: raw.expires, body: raw.body, contentType: raw.contentType })
      return { body: raw.body, contentType: raw.contentType }
    }
  } catch {
    return null
  }
  return null
}

export function writePoliteCache(
  url: string,
  body: string,
  contentType: string,
  now = Date.now()
): void {
  const key = cacheKey(url)
  const entry = { expires: now + POLITE_TTL_MS, body, contentType }
  memoryCache.set(key, entry)
  try {
    const dir = cacheDir()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${key}.json`), JSON.stringify(entry))
  } catch {
    // Memory cache still serves this process when the disk is unavailable.
  }
}

export function resetPoliteFetchState(): void {
  lastRequestAt.clear()
  memoryCache.clear()
}
