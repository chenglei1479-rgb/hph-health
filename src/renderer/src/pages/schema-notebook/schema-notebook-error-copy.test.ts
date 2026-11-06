import { describe, expect, it } from 'vitest'

import { failureText, importFailureCopy } from './schema-notebook-error-copy'

const ipc = (inner: string): Error =>
  new Error(`Error invoking remote method 'schema-notebook:import-table': ${inner}`)

const translate = (result: { key: string; params?: Record<string, string> }): string =>
  Object.entries(result.params ?? {}).reduce(
    (text, [name, value]) => text.replace(`{{${name}}}`, value),
    result.key
  )

describe('schema notebook import failure copy', () => {
  it('maps the no-worksheet sentence through the transport chrome', () => {
    const text = failureText(
      ipc('ApplicationCommandError: Workbook has no worksheets.')
    )
    expect(text).toBe('Workbook has no worksheets.')
    expect(translate(importFailureCopy(text)!)).toBe('This workbook has no worksheets.')
  })

  it('keeps the missing part verbatim when it is interpolated', () => {
    const text = failureText(ipc('Error: Workbook is missing xl/workbook.xml.'))
    expect(text).toBe('Workbook is missing xl/workbook.xml.')
    const copy = importFailureCopy(text)
    expect(copy).toEqual({
      key: 'This workbook is missing {{part}}.',
      params: { part: 'xl/workbook.xml' }
    })
    // A part name carrying brackets and internal dots must not be truncated by the pattern.
    expect(importFailureCopy('Workbook is missing [Content_Types].xml.')?.params?.part).toBe(
      '[Content_Types].xml'
    )
  })

  it('leaves an unrecognised failure exactly as written', () => {
    const text = failureText(ipc('Error: Disk quota exceeded.'))
    expect(text).toBe('Disk quota exceeded.')
    // No catch-all translation: a diagnostic must stay searchable, so this asserts the absence of a
    // catalogue entry rather than the presence of one.
    expect(importFailureCopy(text)).toBeNull()
  })

  it('maps a bare sentence with no transport chrome, as the local bridge rejects it', () => {
    expect(importFailureCopy('Workbook has no worksheets.')).toEqual({
      key: 'This workbook has no worksheets.'
    })
    expect(importFailureCopy('Workbook is missing xl/sharedStrings.xml.')?.params?.part).toBe(
      'xl/sharedStrings.xml'
    )
  })
})
