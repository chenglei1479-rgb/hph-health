import Papa from 'papaparse'

import { ApplicationCommandError } from '../../../shared/application-command-contract'
import {
  COLLECTION_SHEET_NAME,
  SCHEMA_NOTEBOOK_CSV_ENCODING_CODE,
  type CsvEncoding
} from '../../../shared/schema-notebook'
import type { LocalTable } from './schema-profile'
import { readXlsxTable, xlsxBytesFromBase64 } from './xlsx-table'

const MAX_BYTES = 20 * 1024 * 1024

const UTF8_BOM = [0xef, 0xbb, 0xbf]

const bytesFromBase64 = (value: string): Uint8Array => {
  const buffer = Buffer.from(value, 'base64')
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
}

export type DecodedCsv = { text: string; encoding: CsvEncoding }

/**
 * Decodes CSV bytes the way a Japanese desk produces them. Excel writes CP932 unless the user picks
 * UTF-8, and decoding that as UTF-8 yields U+FFFD for every Japanese header — which also defeats the
 * identifier-column and PHI scans, because they read the decoded text. Fatal UTF-8 first, then CP932.
 */
export const decodeCsvBytes = (bytes: Uint8Array): DecodedCsv => {
  if (bytes.byteLength > MAX_BYTES) throw new Error('The table is larger than 20 MB.')
  const hasBom =
    bytes.byteLength >= 3 && UTF8_BOM.every((byte, index) => bytes[index] === byte)
  const body = hasBom ? bytes.subarray(3) : bytes
  try {
    return {
      text: new TextDecoder('utf-8', { fatal: true }).decode(body),
      encoding: hasBom ? 'utf-8-bom' : 'utf-8'
    }
  } catch {
    // Not valid UTF-8: fall through to the Japanese legacy encoding.
  }
  try {
    const text = new TextDecoder('shift_jis').decode(body)
    // A real CP932 file never decodes to replacement characters; if it does, the encoding is unknown.
    if (text.includes('\uFFFD')) throw new Error('replacement characters')
    return { text, encoding: 'shift_jis' }
  } catch {
    throw new ApplicationCommandError(
      SCHEMA_NOTEBOOK_CSV_ENCODING_CODE,
      'Choose a UTF-8 or Shift_JIS CSV file.'
    )
  }
}

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

export type TableInput = {
  table: LocalTable
  /** Exactly the text the PHI scan reads: the decoded CSV, or the workbook's cell dump. */
  scanText: string
  encoding?: CsvEncoding
}

export const readTableInput = (input: {
  filename: string
  csvBase64?: string
  csvText?: string
  xlsxBase64?: string
}): TableInput => {
  const filename = input.filename.toLowerCase()
  if (filename.endsWith('.csv') || input.csvBase64 !== undefined || input.csvText !== undefined) {
    if (input.csvBase64 !== undefined) {
      const decoded = decodeCsvBytes(bytesFromBase64(input.csvBase64))
      return {
        table: importCsvText(decoded.text),
        scanText: decoded.text,
        encoding: decoded.encoding
      }
    }
    if (typeof input.csvText !== 'string') throw new Error('CSV text is missing.')
    return { table: importCsvText(input.csvText), scanText: input.csvText }
  }
  if (filename.endsWith('.xlsx')) {
    if (!input.xlsxBase64) throw new Error('Workbook bytes are missing.')
    const bytes = xlsxBytesFromBase64(input.xlsxBase64)
    return {
      table: importXlsxBytes(bytes),
      scanText: readXlsxTable(bytes, COLLECTION_SHEET_NAME)
        .map((row) => row.join('\t'))
        .join('\n')
    }
  }
  throw new Error('Import a CSV or Excel workbook (.csv, .xlsx).')
}

export const importTableFile = (input: {
  filename: string
  csvBase64?: string
  csvText?: string
  xlsxBase64?: string
}): LocalTable => readTableInput(input).table

/** Text scanned for PHI. CSV keeps source offsets; workbooks use a cell dump. */
export const phiScanText = (input: {
  filename: string
  csvBase64?: string
  csvText?: string
  xlsxBase64?: string
}): string => readTableInput(input).scanText
