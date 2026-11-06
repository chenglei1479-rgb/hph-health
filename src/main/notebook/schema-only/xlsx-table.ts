import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

import { COLLECTION_SHEET_NAME } from '../../../shared/schema-notebook'

const XML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;'
}

export const escapeXml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => XML_ESCAPE[char] ?? char)

// #157: OOXML lets a producer bind the main namespace to a prefix — `<x:workbook xmlns:x="…">` — and
// Excel, LibreOffice and openpyxl all read such a file. Every tag below used to be matched without a
// prefix, so that document matched nothing and the importer reported "Workbook has no worksheets."
// while the file had a sheet with data. Prefixes are therefore optional in the tag patterns, and
// attributes are looked up by their local name so a producer may prefix those too.
const QNAME = '(?:[\\w.-]+:)?'
const TAG = (local: string): string => `<${QNAME}${local}\\b`
const END_TAG = (local: string): string => `</${QNAME}${local}>`

const localName = (name: string): string => name.slice(name.lastIndexOf(':') + 1)

const decodeXml = (value: string): string =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

const columnIndex = (ref: string): number => {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A'
  let index = 0
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64)
  return index - 1
}

const readXml = (files: Record<string, Uint8Array>, path: string): string => {
  const bytes = files[path]
  if (!bytes) throw new Error(`Workbook is missing ${path}.`)
  return strFromU8(bytes)
}

/** Attribute lookup that does not depend on order, or on the prefix the producer gave the name. */
const attributes = (source: string): Map<string, string> => {
  const attrs = new Map<string, string>()
  for (const match of source.matchAll(/([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs.set(match[1], match[2] ?? match[3] ?? '')
  }
  return attrs
}

const attribute = (attrs: Map<string, string>, local: string): string | undefined => {
  const direct = attrs.get(local)
  if (direct !== undefined) return direct
  for (const [name, value] of attrs) if (localName(name) === local) return value
  return undefined
}

// Relationship elements are read in two steps: first the element, then each attribute by name.
// A single order-sensitive pattern used to require `Id` before `Target`, so a valid workbook whose
// producer writes `Type, Target, Id` produced an empty map and the caller reported "Workbook has no
// worksheets." for a file Excel, LibreOffice and openpyxl all open fine.
const sheetTargets = (
  workbookXml: string,
  relsXml: string
): Array<{ name: string; path: string }> => {
  const rels = new Map<string, string>()
  for (const match of relsXml.matchAll(new RegExp(`${TAG('Relationship')}([^>]*?)\\/?>`, 'g'))) {
    const attrs = attributes(match[1])
    const id = attribute(attrs, 'Id')
    const target = attribute(attrs, 'Target')
    if (!id || !target) continue
    const normalized = target.replace(/^\//, '')
    rels.set(id, normalized.startsWith('xl/') ? normalized : `xl/${normalized}`)
  }
  const sheets: Array<{ name: string; path: string }> = []
  for (const match of workbookXml.matchAll(new RegExp(`${TAG('sheet')}([^>]*?)\\/?>`, 'g'))) {
    const attrs = attributes(match[1])
    const name = attribute(attrs, 'name')
    // The relationship id is `r:id` as a rule, but the prefix belongs to the producer.
    const id = attribute(attrs, 'id')
    if (!name || !id) continue
    const path = rels.get(id)
    if (path) sheets.push({ name: decodeXml(name), path })
  }
  return sheets
}

const sharedStrings = (xml: string | undefined): string[] => {
  if (!xml) return []
  return [...xml.matchAll(new RegExp(`${TAG('si')}[^>]*>([\\s\\S]*?)${END_TAG('si')}`, 'g'))].map(
    (match) =>
      decodeXml(
        [...match[1].matchAll(new RegExp(`${TAG('t')}[^>]*>([\\s\\S]*?)${END_TAG('t')}`, 'g'))]
          .map((text) => text[1])
          .join('')
      )
  )
}

const cellValue = (body: string, type: string | undefined, strings: string[]): string => {
  const text = new RegExp(`${TAG('t')}[^>]*>([\\s\\S]*?)${END_TAG('t')}`, 'g')
  if (type === 'inlineStr') {
    return decodeXml([...body.matchAll(text)].map((match) => match[1]).join(''))
  }
  const raw = new RegExp(`${TAG('v')}[^>]*>([\\s\\S]*?)${END_TAG('v')}`).exec(body)?.[1]
  if (raw === undefined) return ''
  if (type === 's') return strings[Number(raw)] ?? ''
  return decodeXml(raw)
}

const rowsFromSheet = (xml: string, strings: string[]): string[][] => {
  const rows: string[][] = []
  const rowPattern = new RegExp(`${TAG('row')}[^>]*>([\\s\\S]*?)${END_TAG('row')}`, 'g')
  const cellPattern = new RegExp(`${TAG('c')}([^>]*?)(?:\\/>|>([\\s\\S]*?)${END_TAG('c')})`, 'g')
  for (const rowMatch of xml.matchAll(rowPattern)) {
    const cells: string[] = []
    for (const cellMatch of rowMatch[1].matchAll(cellPattern)) {
      const attrs = cellMatch[1]
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1] ?? ''
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1]
      const index = ref ? columnIndex(ref) : cells.length
      cells[index] = cellValue(cellMatch[2] ?? '', type, strings)
    }
    rows.push(cells.map((cell) => cell ?? ''))
  }
  return rows.filter((row) => row.some((cell) => cell.trim().length > 0))
}

export const readXlsxTable = (
  bytes: Uint8Array,
  preferredSheet = COLLECTION_SHEET_NAME
): string[][] => {
  const files = unzipSync(bytes)
  const workbook = readXml(files, 'xl/workbook.xml')
  const rels = readXml(files, 'xl/_rels/workbook.xml.rels')
  const sheets = sheetTargets(workbook, rels)
  const selected = sheets.find((sheet) => sheet.name === preferredSheet) ?? sheets[0]
  if (!selected) throw new Error('Workbook has no worksheets.')
  const strings = sharedStrings(
    files['xl/sharedStrings.xml'] ? readXml(files, 'xl/sharedStrings.xml') : undefined
  )
  return rowsFromSheet(readXml(files, selected.path), strings)
}

export const xlsxBytesFromBase64 = (xlsxBase64: string): Uint8Array => {
  const buffer = Buffer.from(xlsxBase64, 'base64')
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
}

/** Minimal workbook used by tests and by the collection-template exporter. */
export const buildXlsx = (
  sheets: Array<{ name: string; rows: string[][]; extraXml?: string }>
): Uint8Array => {
  const files: Record<string, Uint8Array> = {}
  const sheetXml = sheets.map((sheet, index) => {
    const rows = sheet.rows
      .map((row, rowIndex) => {
        const cells = row
          .map((value, column) => {
            const ref = `${columnName(column)}${rowIndex + 1}`
            return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`
          })
          .join('')
        return `<row r="${rowIndex + 1}">${cells}</row>`
      })
      .join('')
    const xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<sheetData>${rows}</sheetData>${sheet.extraXml ?? ''}</worksheet>`
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(xml)
    return `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
  })
  files['[Content_Types].xml'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheets
        .map(
          (_, index) =>
            `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
        )
        .join('') +
      '</Types>'
  )
  files['_rels/.rels'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>'
  )
  files['xl/workbook.xml'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      `<sheets>${sheetXml.join('')}</sheets></workbook>`
  )
  files['xl/_rels/workbook.xml.rels'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets
        .map(
          (_, index) =>
            `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
        )
        .join('') +
      '</Relationships>'
  )
  return zipSync(files)
}

const columnName = (index: number): string => {
  let current = index + 1
  let name = ''
  while (current > 0) {
    const remainder = (current - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    current = Math.floor((current - 1) / 26)
  }
  return name
}
