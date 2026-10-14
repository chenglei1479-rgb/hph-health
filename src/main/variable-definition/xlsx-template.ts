import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

import type { VariableDefinition, VariableDefinitionType } from '../../shared/variable-definition'
import {
  CANDIDATE_SHEET_NAME,
  COLLECTION_SHEET_NAME,
  COLLECTION_TEMPLATE_NOTES,
  DEFINITION_SHEET_NAME,
  NOTES_SHEET_NAME
} from '../../shared/variable-definition'
import { prepareVariableDefinitions } from './prepare-columns'

const XML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;'
}

const TYPE_LABEL: Record<VariableDefinitionType, string> = {
  integer: '整数',
  number: '数値',
  binary: '二値',
  categorical: 'カテゴリ',
  date: '日付',
  text: '文字'
}

const DEFINITION_HEADERS = ['変数名', '定義', '判断する記録', 'コーディング', '型', '許容範囲']

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

export const codesFromCoding = (coding: string): string[] | undefined => {
  const parts = coding
    .split(/[/、,;；]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  const codes = parts.flatMap((part) => {
    const match = /[=＝]([^/、,;；]+)$/.exec(part)
    return match ? [match[1].trim()] : []
  })
  if (codes.length < 2) return undefined
  if (codes.some((code) => code.length === 0)) return undefined
  return codes
}

const rangeBounds = (allowedRange: string): { low: string; high: string } | undefined => {
  const match = /(-?\d+(?:\.\d+)?)\s*(?:-|〜|～|\.\.|—|–)\s*(-?\d+(?:\.\d+)?)/.exec(allowedRange)
  if (!match) return undefined
  return { low: match[1], high: match[2] }
}

type Validation =
  | { kind: 'list'; formula: string }
  | { kind: 'whole' | 'decimal' | 'date'; low: string; high: string }

const listFormula = (codes: string[], candidates: Map<string, string[]>): string => {
  const inline = codes.join(',')
  if (inline.length <= 200 && codes.every((code) => !/[, "]/.test(code))) {
    return `"${inline}"`
  }
  candidates.set(`list-${candidates.size + 1}`, codes)
  return ''
}

const validationFor = (
  variable: VariableDefinition,
  candidates: Map<string, string[]>
): Validation | undefined => {
  const codes =
    variable.type === 'binary' || variable.type === 'categorical'
      ? (codesFromCoding(variable.coding) ?? codesFromCoding(variable.allowedRange))
      : undefined
  if (codes) {
    const formula = listFormula(codes, candidates)
    if (formula) return { kind: 'list', formula }
    const key = [...candidates.keys()].at(-1)
    if (!key) return undefined
    const rowCount = candidates.get(key)?.length ?? 0
    return {
      kind: 'list',
      formula: `${CANDIDATE_SHEET_NAME}!$${columnName(candidates.size - 1)}$2:$${columnName(candidates.size - 1)}$${rowCount + 1}`
    }
  }
  if (variable.type === 'integer' || variable.type === 'number') {
    const bounds = rangeBounds(variable.allowedRange)
    if (!bounds) return undefined
    return {
      kind: variable.type === 'integer' ? 'whole' : 'decimal',
      low: bounds.low,
      high: bounds.high
    }
  }
  if (variable.type === 'date') {
    return { kind: 'date', low: 'DATE(1900,1,1)', high: 'DATE(2100,12,31)' }
  }
  return undefined
}

const validationXml = (validations: Array<Validation | undefined>): string => {
  const items = validations.flatMap((validation, index) => {
    if (!validation) return []
    const sqref = `${columnName(index)}2:${columnName(index)}501`
    if (validation.kind === 'list') {
      return [
        `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${sqref}"><formula1>${escapeXml(validation.formula)}</formula1></dataValidation>`
      ]
    }
    return [
      `<dataValidation type="${validation.kind}" operator="between" allowBlank="1" showErrorMessage="1" sqref="${sqref}"><formula1>${escapeXml(validation.low)}</formula1><formula2>${escapeXml(validation.high)}</formula2></dataValidation>`
    ]
  })
  if (items.length === 0) return ''
  return `<dataValidations count="${items.length}">${items.join('')}</dataValidations>`
}

const sheetFiles = (
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

export const buildCollectionTemplate = (input: VariableDefinition[]): Uint8Array => {
  const variables = prepareVariableDefinitions(input).variables
  if (variables.length === 0) throw new Error('変数定義がありません。')
  const candidates = new Map<string, string[]>()
  const validations = variables.map((variable) => validationFor(variable, candidates))
  const candidateColumns = [...candidates.values()]
  const candidateRows =
    candidateColumns.length === 0
      ? []
      : [
          candidateColumns.map((_, index) => `候補${index + 1}`),
          ...Array.from(
            { length: Math.max(...candidateColumns.map((codes) => codes.length)) },
            (_, row) => candidateColumns.map((codes) => codes[row] ?? '')
          )
        ]
  const sheets: Array<{ name: string; rows: string[][]; extraXml?: string }> = [
    {
      name: COLLECTION_SHEET_NAME,
      rows: [variables.map((variable) => variable.name)],
      extraXml: validationXml(validations)
    },
    {
      name: DEFINITION_SHEET_NAME,
      rows: [
        DEFINITION_HEADERS,
        ...variables.map((variable) => [
          variable.name,
          variable.definition,
          variable.recordType,
          variable.coding,
          TYPE_LABEL[variable.type],
          variable.allowedRange
        ])
      ]
    },
    {
      name: NOTES_SHEET_NAME,
      rows: [['注意'], ...COLLECTION_TEMPLATE_NOTES.map((note) => [note])]
    }
  ]
  if (candidateRows.length > 0) {
    sheets.push({ name: CANDIDATE_SHEET_NAME, rows: candidateRows })
  }
  return sheetFiles(sheets)
}

export const worksheetXml = (bytes: Uint8Array, sheetName: string): string => {
  const files = unzipSync(bytes)
  const workbook = strFromU8(files['xl/workbook.xml'])
  const rels = strFromU8(files['xl/_rels/workbook.xml.rels'])
  const relation = new Map<string, string>()
  for (const match of rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    const target = match[2]
    relation.set(match[1], target.startsWith('xl/') ? target : `xl/${target}`)
  }
  for (const match of workbook.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = /name="([^"]*)"/.exec(match[1])?.[1]
    const id = /r:id="([^"]+)"/.exec(match[1])?.[1]
    if (name === sheetName && id) {
      const path = relation.get(id)
      if (!path || !files[path]) throw new Error(`Missing sheet ${sheetName}.`)
      return strFromU8(files[path])
    }
  }
  throw new Error(`Missing sheet ${sheetName}.`)
}
