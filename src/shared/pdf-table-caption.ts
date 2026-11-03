// #136: the candidate extraction model sometimes places a table's caption inside the table grid as
// a full-width row, while the same caption is also reported separately. Nothing in this app copies a
// caption into a cell (the conversion keeps `caption` apart and the grid leaves covered cells
// empty), so the duplicated row can only come from the model — and it is the app's job to stop
// showing that text twice and calling one copy of it data.
type TableLike = {
  rowCount: number
  columnCount: number
  cells: readonly {
    row: number
    column: number
    rowSpan: number
    columnSpan: number
    text: string
  }[]
}

export type CaptionScan<T extends TableLike> = {
  table: T
  // A leading full-width row repeated the caption and was removed from the cells.
  droppedCaptionRow: boolean
  // The caption text still appears inside the grid (a merged cell, a multi-column row, or a line
  // glued to other text). It is reported instead of guessed at.
  captionInsideCells: boolean
}

const normalise = (text: string): string =>
  text
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[.:;,]+$/u, '')
    .toLowerCase()

const matchingCaption = (text: string, captions: readonly (string | undefined)[]): boolean => {
  const value = normalise(text)
  return value.length > 0 && captions.some((caption) => caption && normalise(caption) === value)
}

// A row that repeats the caption is only removable when it is unambiguous: one cell, first column,
// spanning every column, one row tall. A full-width row that is *not* the caption is ordinary table
// content (section headers are common), so anything else is left exactly as extracted.
export const dropCaptionRow = <T extends TableLike>(
  table: T,
  captions: readonly (string | undefined)[]
): CaptionScan<T> => {
  const usable = captions.filter((caption): caption is string => Boolean(caption?.trim()))
  if (usable.length === 0) return { table, droppedCaptionRow: false, captionInsideCells: false }

  const firstRow = table.cells.filter((cell) => cell.row === 0)
  const leading = firstRow.length === 1 ? firstRow[0]! : undefined
  const isCaptionRow =
    leading !== undefined &&
    leading.column === 0 &&
    leading.columnSpan === table.columnCount &&
    leading.rowSpan === 1 &&
    matchingCaption(leading.text, usable)

  const table2 = isCaptionRow
    ? {
        ...table,
        rowCount: table.rowCount - 1,
        cells: table.cells
          .filter((cell) => cell.row > 0)
          .map((cell) => ({ ...cell, row: cell.row - 1 }))
      }
    : table

  const captionInsideCells = table2.cells.some((cell) =>
    cell.text.split(/\r?\n/u).some((line) => matchingCaption(line, usable))
  )
  return { table: table2 as T, droppedCaptionRow: isCaptionRow, captionInsideCells }
}
