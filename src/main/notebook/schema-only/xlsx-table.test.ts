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

// #157: an XLSX may bind the main namespace to a prefix (`<x:workbook xmlns:x="…">`) and still be a
// legal workbook that Excel, LibreOffice and openpyxl read. The reader matched unprefixed tags only, so
// that file reported "Workbook has no worksheets." while it had a sheet with data.
const prefixedPart = (xml: string, mainElement: string): string => {
  const prefixed = xml.replace(/<([A-Za-z])/g, '<x:$1').replace(/<\/([A-Za-z])/g, '</x:$1')
  // The default namespace moves onto the prefix; the relationships prefix stays as producers write it.
  return prefixed.replace(
    `<x:${mainElement} xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"`,
    `<x:${mainElement} xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"`
  )
}

/** The same workbook, with the main namespace bound to `x:` on the parts that carry it. */
const prefixedWorkbook = (bytes: Uint8Array): Uint8Array => {
  const files = unzipSync(bytes)
  const parts: Record<string, string> = {
    'xl/workbook.xml': 'workbook',
    'xl/worksheets/sheet1.xml': 'worksheet',
    'xl/sharedStrings.xml': 'sst'
  }
  for (const [path, element] of Object.entries(parts)) {
    if (files[path]) files[path] = strToU8(prefixedPart(strFromU8(files[path]), element))
  }
  return zipSync(files)
}

describe('xlsx namespace prefixes', () => {
  it('reads a workbook whose main namespace is bound to a prefix', () => {
    const prefixed = prefixedWorkbook(workbook)
    // Guard the fixture itself: without a prefix the case would pass on the old reader.
    expect(strFromU8(unzipSync(prefixed)['xl/workbook.xml'])).toContain('<x:sheet ')
    expect(readXlsxTable(prefixed)).toEqual(rows)
  })

  it('keeps reading the default-namespace file, byte for byte', () => {
    // The control: the fix must not trade one shape for the other.
    expect(strFromU8(unzipSync(workbook)['xl/workbook.xml'])).toContain('<sheet ')
    expect(readXlsxTable(workbook)).toEqual(rows)
  })

  it('reads a prefixed workbook part with a plain sheet part instead of an empty table', () => {
    // Each part carries its own namespace declaration, so a producer may prefix one and not the other.
    // Before the fix this shape found the sheet but matched no rows, i.e. it returned an empty table.
    const files = unzipSync(prefixedWorkbook(workbook))
    files['xl/worksheets/sheet1.xml'] = unzipSync(workbook)['xl/worksheets/sheet1.xml']
    expect(readXlsxTable(zipSync(files))).toEqual(rows)
  })

  it('still fails loudly when a prefixed workbook has no sheet at all', () => {
    const files = unzipSync(prefixedWorkbook(workbook))
    files['xl/workbook.xml'] = strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<x:sheets></x:sheets></x:workbook>'
    )
    expect(() => readXlsxTable(zipSync(files))).toThrow('Workbook has no worksheets.')
  })
})
