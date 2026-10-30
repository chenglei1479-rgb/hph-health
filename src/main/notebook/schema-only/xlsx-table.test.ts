import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { buildXlsx, readXlsxTable } from './xlsx-table'

type RelationshipAttribute = 'Id' | 'Type' | 'Target'

/** Rewrite `xl/_rels/workbook.xml.rels` so the attributes appear in the requested order. */
const withRelationshipOrder = (
  bytes: Uint8Array,
  order: RelationshipAttribute[]
): Uint8Array => {
  const files = unzipSync(bytes)
  const rels = strFromU8(files['xl/_rels/workbook.xml.rels'])
  const rewritten = rels.replace(/<Relationship\b([^>]*?)\/>/g, (_match, attrs: string) => {
    const value = (name: string): string =>
      new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1] ?? ''
    return `<Relationship ${order.map((name) => `${name}="${value(name)}"`).join(' ')}/>`
  })
  files['xl/_rels/workbook.xml.rels'] = strToU8(rewritten)
  return zipSync(files)
}

const rows = [
  ['group', 'value'],
  ['A', '1'],
  ['B', '2']
]

const workbook = buildXlsx([{ name: 'Sheet1', rows }])

describe('xlsx relationship parsing', () => {
  it('reads the sheet a workbook writes in any attribute order', () => {
    const orders: Array<{ label: string; order: RelationshipAttribute[] }> = [
      { label: 'Id, Type, Target', order: ['Id', 'Type', 'Target'] },
      { label: 'Type, Target, Id', order: ['Type', 'Target', 'Id'] },
      { label: 'Target, Id, Type', order: ['Target', 'Id', 'Type'] }
    ]
    for (const { order } of orders) {
      expect(readXlsxTable(withRelationshipOrder(workbook, order))).toEqual(rows)
    }
  })

  it('still reports a workbook that genuinely has no worksheets', () => {
    const files = unzipSync(workbook)
    files['xl/workbook.xml'] = strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets></sheets></workbook>'
    )
    expect(() => readXlsxTable(zipSync(files))).toThrow('Workbook has no worksheets.')
  })
})
