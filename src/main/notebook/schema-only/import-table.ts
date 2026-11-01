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
const encodingFailure = (): ApplicationCommandError =>
  new ApplicationCommandError(
    SCHEMA_NOTEBOOK_CSV_ENCODING_CODE,
    'Choose a UTF-8 or Shift_JIS CSV file.'
  )

// A NUL byte is never part of a text CSV. Without this check, a UTF-16LE file that happens to be
// mostly ASCII decodes as valid UTF-8 with a NUL between every character — the text is not U+FFFD,
// so the identifier and PHI rules match nothing and the gate silently passes it.
const rejectNul = (text: string): string => {
  if (text.includes('\u0000')) throw encodingFailure()
  return text
}

export const decodeCsvBytes = (bytes: Uint8Array): DecodedCsv => {
  if (bytes.byteLength > MAX_BYTES) throw new Error('The table is larger than 20 MB.')
  const hasBom = bytes.byteLength >= 3 && UTF8_BOM.every((byte, index) => bytes[index] === byte)
  const body = hasBom ? bytes.subarray(3) : bytes
  try {
    return {
      text: rejectNul(new TextDecoder('utf-8', { fatal: true }).decode(body)),
      encoding: hasBom ? 'utf-8-bom' : 'utf-8'
    }
  } catch (error) {
    if (error instanceof ApplicationCommandError) throw error
    // Not valid UTF-8: fall through to the Japanese legacy encoding.
  }
  try {
    // Known limitation: a Latin-1/CP1252 file also decodes as Shift_JIS for some byte sequences and can
    // still pass without U+FFFD, so a European CSV may be labelled Shift_JIS. Detecting that reliably
    // needs a language/byte-shape check; it is tracked as a follow-up, not handled here.
    const text = new TextDecoder('shift_jis').decode(body)
    // A real CP932 file never decodes to replacement characters; if it does, the encoding is unknown.
    if (text.includes('\uFFFD')) throw new Error('replacement characters')
    return { text: rejectNul(text), encoding: 'shift_jis' }
  } catch (error) {
    if (error instanceof ApplicationCommandError) throw error
    throw encodingFailure()
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

// CSV arrives as bytes only. A decoded string would move decoding back into the renderer, which reads
// every file as UTF-8 — the exact hole that turned CP932 headers into U+FFFD and defeated the scans.
export const readTableInput = (input: {
  filename: string
  csvBase64?: string
  xlsxBase64?: string
}): TableInput => {
  const filename = input.filename.toLowerCase()
  if (filename.endsWith('.csv') || input.csvBase64 !== undefined) {
    if (input.csvBase64 === undefined) throw new Error('CSV bytes are missing.')
    const decoded = decodeCsvBytes(bytesFromBase64(input.csvBase64))
    return {
      table: importCsvText(decoded.text),
      scanText: decoded.text,
      encoding: decoded.encoding
    }
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
