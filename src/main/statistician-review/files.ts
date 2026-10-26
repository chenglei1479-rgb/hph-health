import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pdfTranslationResourceDirectory } from '@aipoch/pdf-translation/resources'

import { strToU8, zipSync } from 'fflate'
import { PDFDocument, rgb, type PDFFont } from 'pdf-lib'

import type {
  StatisticianResultCell,
  StatisticianResultSheet
} from '../../shared/statistician-review-export'
import { toUnpackedAsarPath } from '../skills/resource-path'

const XML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;'
}

const escapeXml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => XML_ESCAPE[char] ?? char)

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

const sheetTitle = (name: string, index: number): string => {
  const cleaned = name
    .replace(/[\\/?*[\]:]/g, ' ')
    .trim()
    .slice(0, 31)
  return cleaned.length > 0 ? cleaned : `results${index + 1}`
}

// Same resource as literature/pdf-translation, which resolves it through toUnpackedAsarPath so the
// packaged app reads it from app.asar.unpacked instead of app.asar. Keep both call sites identical.
const fontPath = join(
  toUnpackedAsarPath(pdfTranslationResourceDirectory()),
  'NotoSansSC-Regular.otf'
)

const zip = (files: Record<string, string>): Uint8Array =>
  zipSync(Object.fromEntries(Object.entries(files).map(([path, xml]) => [path, strToU8(xml)])))

export const buildDocx = (text: string): Uint8Array => {
  const paragraphs = text.replace(/\r\n/g, '\n').split('\n')
  const body = paragraphs
    .map(
      (paragraph) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(paragraph)}</w:t></w:r></w:p>`
    )
    .join('')
  return zip({
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>',
    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>',
    'word/document.xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      `<w:body>${body}</w:body></w:document>`
  })
}

const cellXml = (value: StatisticianResultCell, ref: string): string => {
  if (value == null || value === '') return ''
  if (typeof value === 'number') return `<c r="${ref}"><v>${value}</v></c>`
  return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`
}

export const buildResultWorkbook = (sheets: readonly StatisticianResultSheet[]): Uint8Array => {
  const files: Record<string, string> = {}
  const sheetXml = sheets.map((sheet, index) => {
    const rows = [sheet.columns, ...sheet.rows.map((row) => row.map((cell) => cell))]
    const xmlRows = rows
      .map((row, rowIndex) => {
        const cells = row
          .map((value, column) =>
            cellXml(value as StatisticianResultCell, `${columnName(column)}${rowIndex + 1}`)
          )
          .join('')
        return `<row r="${rowIndex + 1}">${cells}</row>`
      })
      .join('')
    files[`xl/worksheets/sheet${index + 1}.xml`] =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<sheetData>${xmlRows}</sheetData></worksheet>`
    return `<sheet name="${escapeXml(sheetTitle(sheet.name, index))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
  })
  files['[Content_Types].xml'] =
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
  files['_rels/.rels'] =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>'
  files['xl/workbook.xml'] =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets>${sheetXml.join('')}</sheets></workbook>`
  files['xl/_rels/workbook.xml.rels'] =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets
      .map(
        (_, index) =>
          `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
      )
      .join('') +
    '</Relationships>'
  return zip(files)
}

const drawable = (font: PDFFont, text: string): string => {
  let out = ''
  for (const char of text) {
    if (char === '\n' || char === '\t') {
      out += char
      continue
    }
    try {
      font.widthOfTextAtSize(char, 11)
      out += char
    } catch {
      out += '?'
    }
  }
  return out
}

const wrap = (font: PDFFont, text: string, size: number, maxWidth: number): string[] => {
  const lines: string[] = []
  for (const paragraph of drawable(font, text).split('\n')) {
    if (paragraph.length === 0) {
      lines.push('')
      continue
    }
    let current = ''
    for (const char of paragraph) {
      const next = current + char
      if (current.length > 0 && font.widthOfTextAtSize(next, size) > maxWidth) {
        lines.push(current)
        current = char
      } else current = next
    }
    lines.push(current)
  }
  return lines
}

type FontkitFactory = { create: (data: Uint8Array) => unknown }

export const buildPdf = async (title: string, body: string): Promise<Uint8Array> => {
  // fontkit publishes no TypeScript declarations.
  // @ts-expect-error TS7016 untyped module
  const loaded = (await import('fontkit')) as FontkitFactory & { default?: FontkitFactory }
  const create = loaded.create ?? loaded.default?.create
  if (!create) throw new Error('The PDF font loader is unavailable. Nothing was exported.')
  const pdf = await PDFDocument.create()
  pdf.registerFontkit({ create } as Parameters<PDFDocument['registerFontkit']>[0])
  const font = await pdf.embedFont(readFileSync(fontPath))
  const size = 11
  const maxWidth = 500
  let page = pdf.addPage([595, 842])
  let y = 800
  page.drawText(drawable(font, title), { x: 48, y, size: 16, font, color: rgb(0.12, 0.16, 0.18) })
  y -= 28
  for (const line of wrap(font, body, size, maxWidth)) {
    if (y < 48) {
      page = pdf.addPage([595, 842])
      y = 800
    }
    if (line.length > 0) {
      page.drawText(line, { x: 48, y, size, font, color: rgb(0.12, 0.16, 0.18) })
    }
    y -= 16
  }
  return pdf.save()
}

const cellText = (cell: StatisticianResultCell): string =>
  cell == null ? '' : String(cell).replace(/[\t\n\r]/g, ' ')

export const sheetText = (sheet: StatisticianResultSheet): string =>
  [
    sheet.columns.map(cellText).join('\t'),
    ...sheet.rows.map((row) => row.map(cellText).join('\t'))
  ].join('\n')

export const sheetsFromConfirmedText = (text: string): StatisticianResultSheet[] =>
  text
    .split('\n\n')
    .filter((block) => block.trim().length > 0)
    .map((block, index) => {
      const lines = block.split('\n').filter((line) => line.length > 0)
      const columns = (lines[0] ?? '').split('\t')
      const rows = lines.slice(1).map((line) =>
        line.split('\t').map((cell) => {
          if (cell.length === 0) return null
          if (/^-?\d+(?:\.\d+)?$/.test(cell)) return Number(cell)
          return cell
        })
      )
      return { name: `results${index + 1}`, columns, rows }
    })
