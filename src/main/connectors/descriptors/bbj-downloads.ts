import { DOMParser } from '@xmldom/xmldom'
import type { ToolDescriptor } from '../types'

// Public catalogue metadata only; never downloads multi-GB GWAS files or controlled data.
export function parseBbjDownloads(html: string, query: string, limit = 20) {
  if (/<!ENTITY/i.test(html) || html.length > 4_000_000) throw new Error('Unsafe or oversized BBJ catalogue')
  const doc = new DOMParser({ errorHandler: { warning: () => {}, error: () => {}, fatalError: () => { throw new Error('Invalid BBJ catalogue') } } }).parseFromString(html, 'text/html')
  const all = Array.from(doc.getElementsByTagName('table'))
  const records: Record<string, unknown>[] = []
  const needle = query.normalize('NFKC').toLowerCase()
  let recognized = 0
  for (const table of all) {
    const rows = Array.from(table.getElementsByTagName('tr'))
    const headers = Array.from(rows[0]?.getElementsByTagName('th') ?? []).map(h => h.textContent?.trim() ?? '')
    if (!headers.some(h => /phenotype/i.test(h)) || !headers.some(h => /download/i.test(h))) continue
    recognized++
    for (const row of rows.slice(1)) {
      const cells = Array.from(row.getElementsByTagName('td'))
      if (cells.length !== headers.length) throw new Error('BBJ catalogue layout changed')
      const fields = Object.fromEntries(headers.map((h, i) => [h, cells[i].textContent?.trim() ?? '']))
      if (!Object.values(fields).some(v => v.normalize('NFKC').toLowerCase().includes(needle))) continue
      const links = Array.from(row.getElementsByTagName('a')).flatMap(a => {
        try {
          const u = new URL(a.getAttribute('href') ?? '', 'https://pheweb.jp/downloads')
          return u.protocol === 'https:' && !u.username && !u.password ? [u.toString()] : []
        } catch { return [] }
      })
      records.push({ fields, download_links: links })
    }
  }
  if (!recognized) throw new Error('No recognized BBJ download table; do not report an empty search')
  return { source: 'BioBank Japan PheWeb public GWAS download catalogue', retrieved_at: new Date().toISOString(),
    total: records.length, returned: Math.min(limit, records.length), truncated: records.length > limit,
    records: records.slice(0, limit), catalogue_url: 'https://pheweb.jp/downloads',
    limitations: 'Metadata only. Cohorts, releases and genome builds vary; verify each phenotype page and file specification before analysis. Cite its original study. No GWAS file or individual-level data downloaded.' }
}

export const BBJ_DOWNLOAD_TOOLS: ToolDescriptor[] = [{
  id: 'bbj_search_gwas_downloads', connector: 'japan-research',
  example: `await host.mcp('japan-research', 'bbj_search_gwas_downloads', { query: 'diabetes', count: 20 });`,
  returns: 'source, retrieved_at, total, returned, truncated, records (catalogue fields and download_links), catalogue_url and limitations. Metadata from the public download catalogue only; no summary-statistics file or individual-level data is downloaded.',
  description: 'Search the official BioBank Japan PheWeb GWAS summary-statistics download catalogue by phenotype or cohort. Returns sample counts, cohort and published links, not GWAS data. Verify genome build and cite the original phenotype study; no patient-level access.',
  input: { type: 'object', properties: { query: { type: 'string', minLength: 1, maxLength: 500 }, count: { type: 'integer', minimum: 1, maximum: 100 } }, required: ['query'], additionalProperties: false },
  maxResponseBytes: 4_000_000,
  run: async (ctx, a) => {
    if (typeof a.query !== 'string' || !a.query.trim()) throw new Error('A query is required')
    const count = a.count === undefined ? 20 : Number(a.count)
    if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error('Invalid count')
    return parseBbjDownloads(await ctx.fetchText('https://pheweb.jp/downloads', 'text/html'), a.query.trim(), count)
  }
}]
