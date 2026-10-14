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

const sheetTargets = (
  workbookXml: string,
  relsXml: string
): Array<{ name: string; path: string }> => {
  const rels = new Map<string, string>()
  for (const match of relsXml.matchAll(
    /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/?>/g
  )) {
    const target = match[2].replace(/^\//, '')
    rels.set(match[1], target.startsWith('xl/') ? target : `xl/${target}`)
  }
  const sheets: Array<{ name: string; path: string }> = []
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const attrs = match[1]
    const name = /name="([^"]*)"/.exec(attrs)?.[1]
    const id = /r:id="([^"]+)"/.exec(attrs)?.[1]
    if (!name || !id) continue
    const path = rels.get(id)
    if (path) sheets.push({ name: decodeXml(name), path })
  }
  return sheets
}

const sharedStrings = (xml: string | undefined): string[] => {
  if (!xml) return []
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) =>
    decodeXml([...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((text) => text[1]).join(''))
  )
}

const cellValue = (body: string, type: string | undefined, strings: string[]): string => {
  if (type === 'inlineStr') {
    return decodeXml(
      [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((match) => match[1]).join('')
    )
  }
  const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1]
  if (raw === undefined) return ''
  if (type === 's') return strings[Number(raw)] ?? ''
  return decodeXml(raw)
}

const rowsFromSheet = (xml: string, strings: string[]): string[][] => {
  const rows: string[][] = []
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = []
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
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
