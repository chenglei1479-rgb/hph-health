import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { bibliographicRecordSchema } from '../../../packages/literature-citations/src/contracts.js'
import { LiteratureCitationFormatter } from '../../../packages/literature-citations/src/citation-formatter.js'

const types = ['journalArticle', 'conferencePaper', 'thesis'] as const
const references = types.map((itemType) => ({
  id: itemType,
  item: bibliographicRecordSchema.parse({ itemType, title: itemType })
}))

describe('RIS document types', () => {
  it('round trips a mixed library with three distinct RIS types', async () => {
    const formatter = new LiteratureCitationFormatter()
    const ris = await formatter.exportReferences(references, 'ris')
    expect([...ris.matchAll(/^TY {2}- (\S+)/gmu)].map((match) => match[1])).toEqual([
      'JOUR',
      'CPAPER',
      'THES'
    ])
    const parsed = await formatter.parseReferences(ris)
    expect(parsed.errors).toEqual([])
    expect(parsed.items.map((item) => item.itemType)).toEqual(types)
  })

  it('keeps the BibTeX entry types for the same library', async () => {
    const bibtex = await new LiteratureCitationFormatter().exportReferences(references, 'bibtex')
    expect([...bibtex.matchAll(/@(\w+)\{/gu)].map((match) => match[1].toLowerCase())).toEqual([
      'article',
      'inproceedings',
      'phdthesis'
    ])
  })

  it('preserves CPAPER from an external RIS fixture', async () => {
    const text = await readFile(new URL('./fixtures/conference-paper.ris', import.meta.url), 'utf8')
    const parsed = await new LiteratureCitationFormatter().parseReferences(text)
    expect(parsed.errors).toEqual([])
    expect(parsed.items).toHaveLength(1)
    expect(parsed.items[0]?.itemType).toBe('conferencePaper')
  })

  it.each([
    ['book', 'BOOK'],
    ['bookSection', 'CHAP'],
    ['report', 'RPRT'],
    ['preprint', 'UNPB'],
    ['review', 'JOUR'],
    ['dataset', 'DATA'],
    ['standard', 'STAND'],
    ['patent', 'PAT'],
    ['webpage', 'ELEC'],
    ['document', 'GEN']
  ])('preserves %s through %s without inventing metadata', async (itemType, ty) => {
    const formatter = new LiteratureCitationFormatter()
    const item = bibliographicRecordSchema.parse({ itemType, title: 'Only a title' })
    const ris = await formatter.exportReferences([{ id: 'minimal', item }], 'ris')
    expect(ris).toContain(`TY  - ${ty}`)
    expect(ris).not.toMatch(/^(?:PY|DA|DO|AU|PB) {2}- .+/mu)
    if (['review', 'preprint', 'document'].includes(itemType)) {
      expect(ris).toContain(`N1  - Baselio document type: ${itemType}`)
    }
    const parsed = await formatter.parseReferences(ris)
    expect(parsed.errors).toEqual([])
    expect(parsed.items[0]?.itemType).toBe(itemType)
  })
})
