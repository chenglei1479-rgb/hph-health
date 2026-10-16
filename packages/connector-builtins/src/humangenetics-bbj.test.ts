import { describe, it, expect } from 'vitest'
import {
  summaryLinks,
  HUMANGENETICS_BBJ_TOOLS,
  NBDC_CONTROLLED_ACCESS_MESSAGE,
  isUnrestrictedDataset
} from './humangenetics-bbj'

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
  it('keeps Japanese unrestricted rows and hard-refuses a controlled-only catalogue', () => {
    const html = `<table><tr><td><a href="/data/NHA000200">NHA000200</a></td><td>GWAS summary</td><td>制限なし</td></tr>
      <tr><td><a href="/data/NHA000201">NHA000201</a></td><td>GWAS</td><td>制限あり</td></tr></table>`
    expect(isUnrestrictedDataset('制限なし GWAS summary')).toBe(true)
    expect(summaryLinks(html, 'nbdc').map((row) => row.accession)).toEqual(['NHA000200'])
    expect(() =>
      summaryLinks(
        '<table><tr><td><a href="/data/NHA9">NHA9</a></td><td>GWAS</td><td>Controlled-access</td></tr></table>',
        'nbdc'
      )
    ).toThrow(NBDC_CONTROLLED_ACCESS_MESSAGE)
  })
  it('refuses a controlled-access query before fetching the catalogue', async () => {
    const tool = HUMANGENETICS_BBJ_TOOLS[0]
    const fetchText = async (): Promise<never> => {
      throw new Error('should not fetch')
    }
    await expect(
      tool.run!({ fetchText } as never, { source: 'nbdc', query: '制限あり genotype' })
    ).rejects.toThrow(NBDC_CONTROLLED_ACCESS_MESSAGE)
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
