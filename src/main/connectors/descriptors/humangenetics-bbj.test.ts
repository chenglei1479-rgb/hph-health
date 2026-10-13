import { describe, it, expect } from 'vitest'
import { summaryLinks, HUMANGENETICS_BBJ_TOOLS } from './humangenetics-bbj'

describe('BBJ summary catalogues', () => {
  it('excludes controlled individual genotypes and preserves NHA accession', () => {
    const html = `<table><tr><td><a href="/data/NHA000126">NHA000126</a></td><td>GWAS for 40 diseases</td><td>Unrestricted-access</td></tr>
    <tr><td><a href="/data/JGAD000165">JGAD000165</a></td><td>GWAS</td><td>Controlled-access</td></tr></table>`
    expect(summaryLinks(html, 'nbdc')).toEqual([
      expect.objectContaining({
        accession: 'NHA000126',
        url: 'https://humandbs.dbcls.jp/data/NHA000126'
      })
    ])
  })
  it('resolves JENGER port 8080 downloads and excludes external or executable links', () => {
    const html = `<table><tr><td>Diabetes</td><td><a href="http://jenger.riken.jp:8080/download/T2D">Download</a></td>
      <td><a href="https://evil.test/download/T2D">external</a><a href="javascript:alert(1)">bad</a></td></tr></table>`
    expect(summaryLinks(html, 'jenger')).toHaveLength(1)
    expect(summaryLinks(html, 'jenger')[0].url).toBe('http://jenger.riken.jp:8080/download/T2D')
  })
  it('does not turn layout drift or a login page into a successful empty catalogue', () => {
    expect(() => summaryLinks('<html>login</html>', 'nbdc')).toThrow(/layout or access/)
  })
  it('does not declare a genome build for the full NBDC catalogue', async () => {
    const tool = HUMANGENETICS_BBJ_TOOLS[0]
    const result = await tool.run!(
      {
        fetchText: async () =>
          '<table><tr><td><a href="/NHA000126">NHA000126</a></td><td>GWAS Unrestricted-access</td></tr></table>'
      } as never,
      { source: 'nbdc' }
    )
    expect(result).toMatchObject({ genome_build: null, returned: 1, truncated: false })
  })
})
