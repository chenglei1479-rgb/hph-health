import { describe, expect, it } from 'vitest'

import { ApplicationCommandError } from '../../../shared/application-command-contract'
import { SCHEMA_NOTEBOOK_CSV_ENCODING_CODE } from '../../../shared/schema-notebook'
import { findDirectIdentifierColumns } from './identifier-columns'
import { decodeCsvBytes, readTableInput } from './import-table'
import { detectPatientPhiSpans } from './patient-phi'

// CP932 bytes, exactly what Japanese Excel writes for "CSV (コンマ区切り)".
const cp932 = (bytes: number[]): Uint8Array => Uint8Array.from(bytes)
const HEADER = [
  0x8a, 0xb3, 0x8e, 0xd2, 0x8e, 0x81, 0x96, 0xbc, // 患者氏名
  0x2c,
  0x8a, 0xb3, 0x8e, 0xd2, 0x49, 0x44, // 患者ID
  0x2c,
  0x90, 0xb6, 0x94, 0x4e, 0x8c, 0x8e, 0x93, 0xfa, // 生年月日
  0x2c,
  0x94, 0x4e, 0x97, 0xee, // 年齢
  0x0a
]
const ROW = [
  0x8a, 0xb3, 0x8e, 0xd2, 0x8e, 0x81, 0x96, 0xbc, 0x3a, 0x8e, 0x52, 0x93, 0x63, // 患者氏名:山田
  0x2c,
  0x31, 0x32, 0x33, 0x34, // 1234
  0x2c,
  0x31, 0x39, 0x36, 0x30, 0x2d, 0x30, 0x31, 0x2d, 0x30, 0x32, // 1960-01-02
  0x2c,
  0x36, 0x35, // 65
  0x0a
]
const cp932Bytes = cp932([...HEADER, ...ROW])
const utf8Text = '患者氏名,患者ID,生年月日,年齢\n患者氏名:山田,1234,1960-01-02,65\n'
const utf8Bytes = new TextEncoder().encode(utf8Text)
const bomBytes = Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8Bytes])
const base64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64')

describe('CSV decoding', () => {
  it('reads a CP932 file as Shift_JIS and reports the encoding', () => {
    const decoded = decodeCsvBytes(cp932Bytes)
    expect(decoded.encoding).toBe('shift_jis')
    expect(decoded.text).toBe(utf8Text)
  })

  it('reads UTF-8 with and without a BOM', () => {
    expect(decodeCsvBytes(utf8Bytes)).toEqual({ text: utf8Text, encoding: 'utf-8' })
    expect(decodeCsvBytes(bomBytes)).toEqual({ text: utf8Text, encoding: 'utf-8-bom' })
  })

  it('gives every encoding the same schema', () => {
    const schemas = [utf8Bytes, bomBytes, cp932Bytes].map((bytes) => {
      const input = readTableInput({ filename: 'table.csv', csvBase64: base64(bytes) })
      return input.table
    })
    for (const table of schemas) {
      expect(table.columns).toEqual(['患者氏名', '患者ID', '生年月日', '年齢'])
      expect(table.rows).toEqual([['患者氏名:山田', '1234', '1960-01-02', '65']])
    }
  })

  it('flags the identifier columns of a CP932 table', () => {
    const table = readTableInput({ filename: 'table.csv', csvBase64: base64(cp932Bytes) }).table
    const withheld = findDirectIdentifierColumns(table.columns, table.rows).map(
      (warning) => warning.column
    )
    expect(withheld).toEqual(expect.arrayContaining(['患者氏名', '患者ID', '生年月日']))
    expect(withheld).not.toContain('年齢')
  })

  it('scans the decoded CP932 text, so a patient name is still detected', () => {
    const input = readTableInput({ filename: 'table.csv', csvBase64: base64(cp932Bytes) })
    expect(input.scanText).toBe(utf8Text)
    const spans = detectPatientPhiSpans(input.scanText)
    expect(spans.length).toBeGreaterThan(0)
    expect(spans.map((span) => span.text).join('\n')).toContain('山田')
    // The same content decodes to the same PHI verdict either way.
    expect(spans).toEqual(detectPatientPhiSpans(utf8Text))
  })

  it('refuses bytes that are neither UTF-8 nor CP932 with the stable code', () => {
    expect(() => decodeCsvBytes(Uint8Array.from([0xff, 0xfe, 0x00, 0x41]))).toThrowError(
      ApplicationCommandError
    )
    try {
      decodeCsvBytes(Uint8Array.from([0xff, 0xfe, 0x00, 0x41]))
    } catch (error) {
      expect((error as ApplicationCommandError).code).toBe(SCHEMA_NOTEBOOK_CSV_ENCODING_CODE)
    }
  })
})
