const COUNT_HEADER = /^(n|count|counts|freq|frequency|件数|例数|人数|度数)$/i

const isSmallCount = (cell: string): boolean => {
  const trimmed = cell.trim()
  if (!/^\d+$/.test(trimmed)) return false
  const value = Number(trimmed)
  return Number.isInteger(value) && value >= 0 && value < 10
}

const suppressCountCell = (header: string | undefined, cell: string): string => {
  if (!header || !COUNT_HEADER.test(header.trim())) return cell
  return isSmallCount(cell) ? '<10' : cell
}

const splitMarkdownRow = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())

const joinMarkdownRow = (cells: string[]): string => `| ${cells.join(' | ')} |`

const suppressMarkdownTables = (text: string): string => {
  const lines = text.split('\n')
  let header: string[] | null = null
  return lines
    .map((line) => {
      if (!line.trim().startsWith('|')) {
        header = null
        return line
      }
      const cells = splitMarkdownRow(line)
      if (header === null) {
        header = cells
        return line
      }
      if (cells.every((cell) => /^:?-+:?$/.test(cell))) return line
      return joinMarkdownRow(cells.map((cell, index) => suppressCountCell(header?.[index], cell)))
    })
    .join('\n')
}

const parseCsvLine = (line: string): string[] => {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else if (char === '"') quoted = false
      else current += char
      continue
    }
    if (char === '"') quoted = true
    else if (char === ',') {
      cells.push(current)
      current = ''
    } else current += char
  }
  cells.push(current)
  return cells
}

const suppressCsvTable = (text: string): string => {
  const rawLines = text.split('\n')
  const content = rawLines.filter((line) => line.trim().length > 0)
  if (content.length < 2) return text
  const rows = content.map(parseCsvLine)
  const width = rows[0]?.length ?? 0
  if (width < 2 || !rows.every((row) => row.length === width)) return text
  if (!rows[0].some((cell) => COUNT_HEADER.test(cell.trim()))) return text
  const rendered = rows.map((row, rowIndex) =>
    row
      .map((cell, index) => (rowIndex === 0 ? cell : suppressCountCell(rows[0][index], cell)))
      .join(',')
  )
  let cursor = 0
  return rawLines
    .map((line) => {
      if (line.trim().length === 0) return line
      const next = rendered[cursor]
      cursor += 1
      return next ?? line
    })
    .join('\n')
}

const suppressExplicitCounts = (text: string): string =>
  text.replace(
    /(件数|例数|人数|度数|[nN])(\s*[=＝:：]\s*)(\d+)/g,
    (match, label: string, separator: string, digits: string) => {
      const value = Number(digits)
      if (!Number.isInteger(value) || value < 0 || value >= 10) return match
      return `${label}${separator}<10`
    }
  )

/** Replace aggregate count cells below 10. Other numbers, including means, stay. */
export const suppressSmallAggregateText = (text: string): string =>
  suppressCsvTable(suppressMarkdownTables(suppressExplicitCounts(text)))
