import Papa from 'papaparse'

import { COLLECTION_SHEET_NAME } from '../../../shared/schema-notebook'
import type { LocalTable } from './schema-profile'
import { readXlsxTable, xlsxBytesFromBase64 } from './xlsx-table'

const MAX_BYTES = 20 * 1024 * 1024

const rowsFromMatrix = (matrix: string[][]): LocalTable => {
  const header = (matrix[0] ?? []).map((cell) => cell.trim())
  if (header.length === 0 || header.every((cell) => cell.length === 0)) {
    throw new Error('The table needs a header row.')
  }
  if (header.some((cell) => cell.length === 0)) {
    throw new Error('Every column needs a name.')
  }
  if (new Set(header).size !== header.length) {
    throw new Error('Column names must be unique.')
  }
  const rows = matrix.slice(1).flatMap((row) => {
    const cells = header.map((_, index) => (row[index] ?? '').trim())
    return cells.every((cell) => cell.length === 0) ? [] : [cells]
  })
  return { columns: header, rows }
}

export const importCsvText = (csvText: string): LocalTable => {
  if (Buffer.byteLength(csvText) > MAX_BYTES) throw new Error('The table is larger than 20 MB.')
  const parsed = Papa.parse<string[]>(csvText.replace(/^\uFEFF/, ''), {
    header: false,
    skipEmptyLines: 'greedy'
  })
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors[0]?.message ?? 'The CSV could not be read.')
  }
  return rowsFromMatrix(parsed.data.map((row) => row.map((cell) => String(cell ?? ''))))
}

export const importXlsxBytes = (bytes: Uint8Array): LocalTable => {
  if (bytes.byteLength > MAX_BYTES) throw new Error('The table is larger than 20 MB.')
  return rowsFromMatrix(readXlsxTable(bytes, COLLECTION_SHEET_NAME))
}

export const importTableFile = (input: {
  filename: string
  csvText?: string
  xlsxBase64?: string
}): LocalTable => {
  const filename = input.filename.toLowerCase()
  if (filename.endsWith('.csv') || input.csvText !== undefined) {
    if (typeof input.csvText !== 'string') throw new Error('CSV text is missing.')
    return importCsvText(input.csvText)
  }
  if (filename.endsWith('.xlsx')) {
    if (!input.xlsxBase64) throw new Error('Workbook bytes are missing.')
    return importXlsxBytes(xlsxBytesFromBase64(input.xlsxBase64))
  }
  throw new Error('Import a CSV or Excel workbook (.csv, .xlsx).')
}

/** Text scanned for PHI. CSV keeps source offsets; workbooks use a cell dump. */
export const phiScanText = (input: {
  filename: string
  csvText?: string
  xlsxBase64?: string
}): string => {
  if (input.filename.toLowerCase().endsWith('.csv') || input.csvText !== undefined) {
    return input.csvText ?? ''
  }
  if (!input.xlsxBase64) return ''
  return readXlsxTable(xlsxBytesFromBase64(input.xlsxBase64), COLLECTION_SHEET_NAME)
    .map((row) => row.join('\t'))
    .join('\n')
}
