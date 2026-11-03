import { describe, expect, it } from 'vitest'

import { dropCaptionRow } from './pdf-table-caption'

type T = Parameters<typeof dropCaptionRow>[0]
const table = (cells: T['cells'], rowCount = cells.length): T => ({
  rowCount,
  columnCount: 2,
  cells
})

const cell = (
  row: number,
  column: number,
  text: string,
  extra: Partial<T['cells'][number]> = {}
): T['cells'][number] => ({
  row,
  column,
  rowSpan: 1,
  columnSpan: 1,
  text,
  ...extra
})

describe('table caption row', () => {
  // #136: the caption is also reported separately, so a full-width leading row that repeats it is
  // the same text twice — the second copy must not be presented as data.
  it('drops a leading full-width row that repeats the caption', () => {
    const scan = dropCaptionRow(
      table([
        cell(0, 0, 'Table 2. Treatment-group outcomes.', { columnSpan: 2 }),
        cell(1, 0, 'Age'),
        cell(1, 1, 'n')
      ]),
      ['Table 2. Treatment-group outcomes.']
    )

    expect(scan.droppedCaptionRow).toBe(true)
    expect(scan.table.rowCount).toBe(2)
    expect(scan.table.cells.map(({ row, column, text }) => [row, column, text])).toEqual([
      [0, 0, 'Age'],
      [0, 1, 'n']
    ])
    expect(scan.captionInsideCells).toBe(false)
  })

  it('matches the caption across whitespace, case and a trailing full stop', () => {
    const scan = dropCaptionRow(
      table([
        cell(0, 0, 'TABLE 2.   Treatment-group\noutcomes', { columnSpan: 2 }),
        cell(1, 0, 'x')
      ]),
      ['Table 2. Treatment-group outcomes.']
    )

    expect(scan.droppedCaptionRow).toBe(true)
  })

  it('keeps a full-width section row that is not the caption', () => {
    const original = table([
      cell(0, 0, 'B. Dewa data', { columnSpan: 2 }),
      cell(1, 0, 'Age', { columnSpan: 2 })
    ])
    const scan = dropCaptionRow(original, ['Table 2. Treatment-group outcomes.'])

    expect(scan.droppedCaptionRow).toBe(false)
    expect(scan.table).toBe(original)
  })

  it('does not touch the table when no caption is known', () => {
    const original = table([cell(0, 0, 'Age', { columnSpan: 2 }), cell(1, 0, '42')])
    const scan = dropCaptionRow(original, [undefined, '  '])

    expect(scan.table).toBe(original)
    expect(scan.droppedCaptionRow).toBe(false)
    expect(scan.captionInsideCells).toBe(false)
  })

  // Unsplittable shapes are reported, never rebuilt: a merged cell or a line glued to data cannot
  // be separated without inventing where the caption ends.
  it('reports the caption when it sits inside a multi-column or merged cell', () => {
    const scan = dropCaptionRow(
      table([
        cell(0, 0, 'Age'),
        cell(0, 1, 'Table 2. Outcomes\nn=42'),
        cell(1, 0, '42'),
        cell(1, 1, '7')
      ]),
      ['Table 2. Outcomes']
    )

    expect(scan.droppedCaptionRow).toBe(false)
    expect(scan.captionInsideCells).toBe(true)
  })

  it('reports a caption that is the whole text of a merged cell', () => {
    const scan = dropCaptionRow(
      table([
        cell(0, 0, 'Table 2. Outcomes', { rowSpan: 2, columnSpan: 2 }),
        cell(2, 0, 'Age'),
        cell(2, 1, 'n')
      ]),
      ['Table 2. Outcomes']
    )

    expect(scan.droppedCaptionRow).toBe(false)
    expect(scan.captionInsideCells).toBe(true)
  })
})
