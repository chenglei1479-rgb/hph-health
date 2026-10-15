import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { CONNECTOR_CONTACT_EMAIL } from '../../shared/connector-compliance'
import {
  CONNECTOR_USER_AGENT,
  readPoliteCache,
  reservePoliteSlot,
  resetPoliteFetchState,
  writePoliteCache
} from './polite-fetch'

describe('polite connector fetch', () => {
  afterEach(() => {
    resetPoliteFetchState()
    delete process.env.DRA_CONNECTOR_CACHE_DIR
  })

  it('uses the company contact in the User-Agent and never a personal address', () => {
    expect(CONNECTOR_USER_AGENT).toMatch(/^DRA\/.+ \(\+support@dra-hph.com\)$/)
    expect(CONNECTOR_USER_AGENT).toContain(CONNECTOR_CONTACT_EMAIL)
    expect(CONNECTOR_USER_AGENT).not.toMatch(/@(?!dra-hph\.com)/)
  })

  it('waits about one second between requests to the same host', () => {
    expect(reservePoliteSlot('pheweb.jp', 1_000, 1_000)).toBe(0)
    expect(reservePoliteSlot('pheweb.jp', 1_200, 1_000)).toBe(800)
    expect(reservePoliteSlot('jenger.riken.jp', 1_200, 1_000)).toBe(0)
  })

  it('serves a fresh disk cache entry and drops an expired one', () => {
    process.env.DRA_CONNECTOR_CACHE_DIR = mkdtempSync(join(tmpdir(), 'dra-polite-'))
    writePoliteCache('https://pheweb.jp/downloads', '<table></table>', 'text/html', 5_000)
    expect(readPoliteCache('https://pheweb.jp/downloads', 5_100)?.body).toBe('<table></table>')
    resetPoliteFetchState()
    expect(readPoliteCache('https://pheweb.jp/downloads', 5_100)?.body).toBe('<table></table>')
    expect(
      readPoliteCache('https://pheweb.jp/downloads', 5_000 + 6 * 60 * 60 * 1000 + 1)
    ).toBeNull()
  })
})
