import { describe, it, expect } from 'vitest'
import {
  ciniiUrl,
  parseCinii,
  jstageUrl,
  parseJstage,
  searchRegistryExport,
  JAPAN_RESEARCH_TOOLS
} from './japan-research'
import { parseBbjDownloads } from './bbj-downloads'

describe('Japan research access and response boundaries', () => {
  it('leaves CiNii unavailable until an appid is saved and still builds a registered URL', async () => {
    const tool = JAPAN_RESEARCH_TOOLS.find((entry) => entry.id === 'cinii_search')!
    const fetchJson = async (): Promise<never> => {
      throw new Error('should not fetch')
    }
    await expect(
      tool.run!({ fetchJson, credentials: {} } as never, { query: '肺癌' })
    ).resolves.toMatchObject({ available: false, source: 'CiNii Research' })
    const saved = await tool.run!(
      {
        credentials: { ciniiAppId: 'registered-example' },
        fetchJson: async () => ({
          '@type': 'channel',
          'opensearch:totalResults': '0',
          items: []
        })
      } as never,
      { query: '肺癌' }
    )
    expect(saved).toMatchObject({ available: true, total: 0 })
  })
  it('requires registered CiNii application configuration', () => {
    expect(() => ciniiUrl({ query: '肺癌' })).toThrow()
    const u = new URL(
      ciniiUrl({
        query: '肺癌',
        appid: 'registered-example',
        kind: 'projects',
        data_source: 'KAKEN'
      })
    )
    expect(u.searchParams.get('dataSourceType')).toBe('KAKEN')
    expect(u.pathname).toBe('/opensearch/v2/projects')
  })
  it('does not forward a restricted abstract or claim complete search on one partial page', () => {
    const r = parseCinii({
      '@type': 'channel',
      'opensearch:totalResults': '2',
      items: [{ title: 'fixture', description: 'restricted', abstractLicenseFlag: 'disallow' }]
    })
    expect(r.records[0].abstract).toBeUndefined()
    expect(r.complete).toBe(false)
    expect(r.next_start).toBe(2)
  })
  it('rejects missing result metadata instead of returning empty success', () => {
    expect(() => parseCinii({ error: 'not authorized' })).toThrow()
    expect(() => parseBbjDownloads('<html>Unavailable</html>', 'diabetes')).toThrow()
  })
  it('uses the official J-STAGE article-title parameter and rejects unsafe XML', () => {
    expect(new URL(jstageUrl({ query: '肺癌' })).searchParams.get('article')).toBe('肺癌')
    expect(() =>
      parseJstage('<!DOCTYPE x [<!ENTITY a SYSTEM "file:///private">]><feed/>')
    ).toThrow()
    expect(() => parseJstage('<feed><result><status>1</status></result></feed>')).toThrow()
  })
  it('searches a supplied CSV without interpreting quoted commas or newlines as columns', () => {
    const r = searchRegistryExport({
      source: 'umin',
      query: '肺癌',
      csv: 'ID,Title\r\nUMIN000000001,"肺癌,試験\n追加行"\r\n'
    })
    expect(r.total).toBe(1)
    expect(r.records[0].Title).toBe('肺癌,試験\n追加行')
    expect(r.mode).toBe('user-provided-public-export')
  })
  it.each(['jrct', 'umin'])('retains Japanese public-export metadata headers for %s', (source) => {
    const idHeader = source === 'jrct' ? 'jRCT番号' : 'UMIN試験ID'
    const titleHeader = source === 'jrct' ? '研究の名称' : '試験名'
    const dateHeader = source === 'jrct' ? '研究開始日' : '試験開始日'
    const id = source === 'jrct' ? 'jRCT1234567890' : 'UMIN000000001'
    // Real header spellings, wholly fictional trial/contact values.
    const metadata = {
      [idHeader]: id,
      [titleHeader]: '架空の肺癌試験',
      実施状況: 'recruiting',
      対象疾患: '肺癌',
      介入の内容: '架空の介入',
      [dateHeader]: '2026-01-01'
    }
    const personal = {
      研究責任者: '架空 太郎',
      所属: '架空病院',
      電話: '090-0000-1234',
      メール: 'fiction@example.invalid',
      問い合わせ先: '架空窓口'
    }
    const row = { ...metadata, ...personal }
    const csv = [Object.keys(row).join(','), Object.values(row).join(',')].join('\n')
    expect(searchRegistryExport({ source, csv, query: id }).records).toEqual([metadata])
    expect(searchRegistryExport({ source, csv, query: '架空窓口' }).total).toBe(0)
  })
  it.each(['jrct', 'umin'])(
    'excludes personal and unknown columns from %s results and matching',
    (source) => {
      const id = source === 'jrct' ? 'jRCT1234567890' : 'UMIN000000001'
      const csv =
        'ID,Title,Status,研究責任者,実施責任者,所属,電話,メール,問い合わせ先,Unknown\n' +
        `${id},架空試験,recruiting,架空 太郎,架空 花子,架空病院,090-0000-1234,fiction@example.invalid,架空窓口,カルテ番号：0098765`
      const result = searchRegistryExport({ source, csv, query: '架空試験' })
      expect(result.records).toEqual([{ ID: id, Title: '架空試験', Status: 'recruiting' }])
      expect(searchRegistryExport({ source, csv, query: '架空 太郎' }).total).toBe(0)
      expect(JSON.stringify(result)).not.toMatch(
        /架空 太郎|架空 花子|架空病院|090-0000-1234|fiction@|0098765/
      )
    }
  )
  it('requires source ids and unambiguous CSV headers', () => {
    expect(() =>
      searchRegistryExport({ source: 'jrct', query: 'a', csv: 'id,title\n1,a' })
    ).toThrow()
    expect(() =>
      searchRegistryExport({ source: 'jrct', query: 'a', csv: 'id,id\njRCT123456,a' })
    ).toThrow()
  })
})
