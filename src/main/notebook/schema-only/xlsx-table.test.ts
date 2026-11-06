import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { buildXlsx, readXlsxTable } from './xlsx-table'

type RelationshipAttribute = 'Id' | 'Type' | 'Target'

/** Rewrite `xl/_rels/workbook.xml.rels` so the attributes appear in the requested order. */
const withRelationshipOrder = (bytes: Uint8Array, order: RelationshipAttribute[]): Uint8Array => {
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

// #157: these are the two files from the beta.21 acceptance pack (T10), copied byte for byte:
//   synthetic.xlsx           - the reported file; every element of the main namespace carries `x:`.
//   synthetic_defaultns.xlsx - the same workbook with the default namespace, byte-identical output.
// Generated XML proved the tag patterns; a real producer's file proves the reader. Do not regenerate
// these - a failure here should point at the acceptance record, not at a helper.
const fixtureBytes = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(join(process.cwd(), 'src/main/notebook/schema-only/fixtures', name)))

const prefixedXlsx = fixtureBytes('synthetic.xlsx')
const defaultNsXlsx = fixtureBytes('synthetic_defaultns.xlsx')

// The acceptance record: 13 rows including the header, 5 columns. Read out of the reported file with
// the reader itself and then pinned, so a change in what the reader returns shows up here.
const acceptanceRows = [
  ['研究番号', '年齢', '性別', '30日再入院', '備考'],
  ['SYN001', '40', '男', '0', '架空'],
  ['SYN002', '45', '女', '0', '架空'],
  ['SYN003', '50', '男', '1', '架空'],
  ['SYN004', '55', '女', '0', '架空'],
  ['SYN005', '60', '男', '1', '架空'],
  ['SYN006', '65', '女', '0', '架空'],
  ['SYN007', '70', '男', '1', '架空'],
  ['SYN008', '75', '女', '1', '架空'],
  ['SYN009', '80', '男', '0', '架空'],
  ['SYN010', '85', '女', '1', '架空'],
  ['SYN011', '90', '男', '1', '架空'],
  ['SYN012', '', '女', '0', '架空']
]

describe('xlsx namespace prefixes', () => {
  it('reads the reported file, whose main namespace is bound to a prefix', () => {
    // Guard the fixture itself: without a prefix the case would pass on the old reader.
    expect(strFromU8(unzipSync(prefixedXlsx)['xl/workbook.xml'])).toContain('<x:sheet ')
    const rows = readXlsxTable(prefixedXlsx)
    expect(rows).toHaveLength(13)
    expect(rows[0]).toHaveLength(5)
    expect(rows).toEqual(acceptanceRows)
  })

  it('reads the default-namespace control into exactly the same rows', () => {
    // The fix must not trade one shape for the other: both files, one result.
    expect(strFromU8(unzipSync(defaultNsXlsx)['xl/workbook.xml'])).toContain('<sheet ')
    expect(readXlsxTable(defaultNsXlsx)).toEqual(acceptanceRows)
    expect(readXlsxTable(prefixedXlsx)).toEqual(readXlsxTable(defaultNsXlsx))
  })

  it('reads a prefixed workbook part with a plain sheet part instead of an empty table', () => {
    // Each part carries its own namespace declaration, so a producer may prefix one and not the other.
    // Before the fix this shape found the sheet but matched no rows, i.e. it returned an empty table.
    const files = unzipSync(prefixedXlsx)
    files['xl/worksheets/sheet1.xml'] = unzipSync(defaultNsXlsx)['xl/worksheets/sheet1.xml']
    expect(readXlsxTable(zipSync(files))).toEqual(acceptanceRows)
  })

  it('still fails loudly when a prefixed workbook has no sheet at all', () => {
    const files = unzipSync(prefixedXlsx)
    files['xl/workbook.xml'] = strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<x:sheets></x:sheets></x:workbook>'
    )
    expect(() => readXlsxTable(zipSync(files))).toThrow('Workbook has no worksheets.')
  })
})
