import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  citationExportDecision,
  crossrefWorkUrl,
  extractCitationIdentifiers,
  pubmedSummaryUrl,
  resetCitationVerificationState,
  verifyCitations
} from './citation-verification'

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(process.cwd(), 'src/shared/citations/fixtures', name), 'utf8'))

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })

const textResponse = (body: string, status: number): Response => new Response(body, { status })

afterEach(() => {
  resetCitationVerificationState()
  vi.useRealTimers()
})

describe('citation verification', () => {
  it('extracts PMID and DOI identifiers without keeping the surrounding sentence', () => {
    const text =
      'Washington et al. described "The HITECH Era and the Path Forward." in 2017 (PMID: 28877013). See doi:10.1038/nature12373.'
    expect(extractCitationIdentifiers(text)).toEqual([
      { kind: 'pmid', id: '28877013', index: text.indexOf('PMID') },
      { kind: 'doi', id: '10.1038/nature12373', index: text.indexOf('10.1038') }
    ])
    expect(pubmedSummaryUrl('28877013')).not.toContain('HITECH')
    expect(crossrefWorkUrl('10.1038/nature12373')).toBe(
      'https://api.crossref.org/works/10.1038%2Fnature12373'
    )
  })

  it('marks recorded PubMed and Crossref metadata verified, mismatched, missing, or offline', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('id=28877013')) return jsonResponse(fixture('pubmed-28877013.json'))
      if (url.includes('id=99999999')) return jsonResponse(fixture('pubmed-missing.json'))
      if (url.includes('10.1038%2Fnature12373'))
        return jsonResponse(fixture('crossref-nature12373.json'))
      if (url.includes('10.9999%2Fmissing'))
        return textResponse(String(fixture('crossref-missing.json')), 404)
      throw new Error('offline')
    })
    const text = [
      'Washington et al. "The HITECH Era and the Path Forward." 2017 PMID: 28877013',
      'Smith et al. "An unrelated laboratory title about widgets" 1999 PMID 99999999',
      'Kucsko et al. 2013 doi:10.1038/nature12373.',
      'Offline claim PMID: 12345'
    ].join('\n')

    const checks = await verifyCitations(text, { fetchImpl })
    expect(checks).toEqual([
      { kind: 'pmid', id: '28877013', status: 'verified' },
      { kind: 'pmid', id: '99999999', status: 'not-found' },
      { kind: 'doi', id: '10.1038/nature12373', status: 'verified' },
      { kind: 'pmid', id: '12345', status: 'unverified' }
    ])
    const urls = fetchImpl.mock.calls.map((call) => String(call[0]))
    expect(urls.join('\n')).not.toContain('unrelated laboratory')
    expect(urls.join('\n')).not.toContain('Washington')
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('widgets')

    const mismatched = await verifyCitations(
      'Smith et al. "Completely different article title" 1999 PMID: 28877013',
      { fetchImpl }
    )
    expect(mismatched[0]).toMatchObject({
      status: 'mismatch',
      mismatches: expect.arrayContaining(['title', 'author', 'year'])
    })
    expect(
      fetchImpl.mock.calls.filter((call) => String(call[0]).includes('28877013'))
    ).toHaveLength(1)
  })

  it('spaces identifier requests at least 350ms apart', async () => {
    vi.useFakeTimers()
    let now = 0
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const fetchImpl = vi.fn(async () => jsonResponse(fixture('pubmed-missing.json')))
    const pending = verifyCitations('PMID: 111 PMID: 222', {
      fetchImpl,
      now: () => now
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    now = 349
    await vi.advanceTimersByTimeAsync(349)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    now = 350
    await vi.advanceTimersByTimeAsync(1)
    await pending
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('blocks export of not-found citations unless an override reason is supplied', () => {
    const checks = [{ kind: 'pmid' as const, id: '99999999', status: 'not-found' as const }]
    expect(citationExportDecision(checks, undefined)).toEqual({ allow: false })
    expect(citationExportDecision(checks, '  no')).toEqual({ allow: false })
    expect(citationExportDecision(checks, 'The identifier was illustrative only.')).toEqual({
      allow: true,
      override: {
        ids: ['pmid:99999999'],
        reason: 'The identifier was illustrative only.'
      }
    })
    expect(
      citationExportDecision(
        [{ kind: 'doi', id: '10.1038/nature12373', status: 'unverified' }],
        undefined
      )
    ).toEqual({ allow: true })
  })
})
