import { describe, it, expect } from 'vitest'
import { ciniiUrl, parseCinii, jstageUrl, parseJstage, searchRegistryExport } from './japan-research'
import { parseBbjDownloads } from './bbj-downloads'

describe('Japan research access and response boundaries', () => {
  it('requires registered CiNii application configuration', () => {
    expect(() => ciniiUrl({query:'肺癌'})).toThrow()
    const u = new URL(ciniiUrl({query:'肺癌',appid:'registered-example',kind:'projects',data_source:'KAKEN'}))
    expect(u.searchParams.get('dataSourceType')).toBe('KAKEN')
    expect(u.pathname).toBe('/opensearch/v2/projects')
  })
  it('does not forward a restricted abstract or claim complete search on one partial page', () => {
    const r = parseCinii({'@type':'channel','opensearch:totalResults':'2',items:[{title:'fixture',description:'restricted',abstractLicenseFlag:'disallow'}]})
    expect(r.records[0].abstract).toBeUndefined()
    expect(r.complete).toBe(false)
    expect(r.next_start).toBe(2)
  })
  it('rejects missing result metadata instead of returning empty success', () => {
    expect(() => parseCinii({error:'not authorized'})).toThrow()
    expect(() => parseBbjDownloads('<html>Unavailable</html>','diabetes')).toThrow()
  })
  it('uses the official J-STAGE article-title parameter and rejects unsafe XML', () => {
    expect(new URL(jstageUrl({query:'肺癌'})).searchParams.get('article')).toBe('肺癌')
    expect(() => parseJstage('<!DOCTYPE x [<!ENTITY a SYSTEM "file:///private">]><feed/>')).toThrow()
    expect(() => parseJstage('<feed><result><status>1</status></result></feed>')).toThrow()
  })
  it('searches a supplied CSV without interpreting quoted commas or newlines as columns', () => {
    const r = searchRegistryExport({source:'umin',query:'肺癌',csv:'ID,Title\r\nUMIN000000001,"肺癌,試験\n追加行"\r\n'})
    expect(r.total).toBe(1)
    expect(r.records[0].Title).toBe('肺癌,試験\n追加行')
    expect(r.mode).toBe('user-provided-public-export')
  })
  it('requires source ids and unambiguous CSV headers', () => {
    expect(() => searchRegistryExport({source:'jrct',query:'a',csv:'id,title\n1,a'})).toThrow()
    expect(() => searchRegistryExport({source:'jrct',query:'a',csv:'id,id\njRCT123456,a'})).toThrow()
  })
})
