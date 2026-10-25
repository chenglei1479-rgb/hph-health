// Refuses Notebook text that is an individual patient row before it can reach a model.
// Aggregate summaries (a statistic column, a describe() table, a frequency series) stay.
// The check is on the output text, so .head() / .tail() / .sample() / print(df) / R head()
// are treated the same when they render rows.

import { createHash } from 'node:crypto'

export const PATIENT_ROW_BLOCK_MESSAGE = [
  '個々の患者の行はモデルに渡しません。',
  '.head()、.tail()、.sample() のような行の一覧、行ごとの表示、1人分の値、1人に絞った表は、患者ごとの行が含まれるためブロックしました。',
  '平均・件数・群ごとの集計のように、行の中身を含まない結果だけを出力してください。'
].join('')

type ParsedTable = {
  headers: string[]
  rows: string[][]
}

const STAT_HEADER =
  /^(?:n|count|counts|freq|frequency|mean|std|sem|sd|median|min|max|sum|var|variance|percent|pct|proportion|rate|share|average|avg|value|values|result|estimate|statistic|stat|total|unique|top|25%|50%|75%|件数|例数|人数|度数|平均|平均値|中央値|標準偏差|分散|合計|割合|最小|最大|値)$/i

const STAT_PART =
  /(?:^|_)(?:n|count|counts|freq|frequency|mean|std|sem|sd|median|min|max|sum|percent|pct|rate|avg|average)(?:_|$)/i

const isStatHeader = (header: string): boolean => {
  const name = header.trim().replace(/^["']|["']$/g, '')
  if (!name) return false
  return STAT_HEADER.test(name) || STAT_PART.test(name)
}

const tokenize = (line: string): string[] =>
  line
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)

const isFrameFooter = (line: string): boolean =>
  /^\[\d+\s+rows?\s+x\s+\d+\s+columns?\]$/i.test(line.trim()) ||
  /^Name:\s*.+,\s*dtype:/i.test(line.trim())

const headerCell = (cell: string): boolean => {
  const trimmed = cell.trim()
  return trimmed.length > 0 && trimmed.length <= 40 && !/\s/.test(trimmed)
}

const splitDelimitedLine = (line: string, delimiter: string): string[] => {
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
    else if (char === delimiter) {
      cells.push(current)
      current = ''
    } else current += char
  }
  cells.push(current)
  return cells
}

const parseDelimitedTables = (text: string, delimiter: string): ParsedTable[] => {
  const tables: ParsedTable[] = []
  let run: string[][] = []
  const flush = (): void => {
    if (run.length >= 2 && run[0].length >= 2 && run.every((row) => row.length === run[0].length)) {
      const headers = run[0].map((cell) => cell.trim())
      if (headers.every(headerCell)) {
        tables.push({
          headers,
          rows: run.slice(1).map((row) => row.map((cell) => cell.trim()))
        })
      }
    }
    run = []
  }
  for (const line of text.split('\n')) {
    if (line.trim().length === 0 || !line.includes(delimiter)) {
      flush()
      continue
    }
    const cells = splitDelimitedLine(line, delimiter)
    if (run.length > 0 && cells.length !== run[0].length) flush()
    run.push(cells)
  }
  flush()
  return tables
}

const parseMarkdownTables = (text: string): ParsedTable[] => {
  const tables: ParsedTable[] = []
  let run: string[][] = []
  const flush = (): void => {
    const rows = run.filter((cells) => !cells.every((cell) => /^:?-+:?$/.test(cell)))
    if (
      rows.length >= 2 &&
      rows[0].length >= 2 &&
      rows.every((row) => row.length === rows[0].length)
    ) {
      tables.push({ headers: rows[0], rows: rows.slice(1) })
    }
    run = []
  }
  for (const line of text.split('\n')) {
    if (!line.trim().startsWith('|')) {
      flush()
      continue
    }
    const cells = line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim())
    if (run.length > 0 && cells.length !== run[0].length) flush()
    run.push(cells)
  }
  flush()
  return tables
}

const parseWhitespaceFrames = (text: string): ParsedTable[] => {
  const lines = text.split('\n')
  const tables: ParsedTable[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const headerLine = lines[index] ?? ''
    if (headerLine.trim().length === 0 || isFrameFooter(headerLine)) continue
    const headerTokens = tokenize(headerLine)
    if (headerTokens.length < 1 || /^\d+$/.test(headerTokens[0] ?? '')) continue
    const dataTokens: string[][] = []
    let cursor = index + 1
    while (cursor < lines.length) {
      const line = lines[cursor] ?? ''
      if (line.trim().length === 0 || isFrameFooter(line)) break
      const tokens = tokenize(line)
      if (!/^\d+$/.test(tokens[0] ?? '')) break
      dataTokens.push(tokens)
      cursor += 1
    }
    if (dataTokens.length === 0) continue
    const width = dataTokens[0]?.length ?? 0
    if (width < 2 || !dataTokens.every((row) => row.length === width)) continue
    if (headerTokens.length === width - 1 || headerTokens.length === width) {
      const dropIndex = headerTokens.length === width
      tables.push({
        headers: dropIndex ? headerTokens.slice(1) : headerTokens,
        rows: dataTokens.map((row) => row.slice(1))
      })
      index = cursor - 1
    }
  }
  return tables
}

const isDescribeTable = (table: ParsedTable): boolean => {
  const labels = table.rows.map((row) => row[0]?.trim() ?? '').filter((label) => label.length > 0)
  if (labels.length < 3) return false
  const stats = labels.filter((label) => isStatHeader(label)).length
  return stats / labels.length >= 0.6
}

// A statistic column (n, mean, 件数, …) marks a group summary. Raw .head() frames have none.
const isAggregateTable = (table: ParsedTable): boolean => {
  if (table.rows.length === 0) return true
  if (isDescribeTable(table)) return true
  const headers = table.headers.map((header) => header.trim()).filter((header) => header.length > 0)
  const statCount = headers.filter((header) => isStatHeader(header)).length
  if (statCount === 0) return false
  const groupKeys = headers.length - statCount
  return groupKeys <= 4
}

const dictKeyGroups = (text: string): string[][] => {
  const bodies = text.match(/\{[^{}]+\}/g) ?? []
  return bodies
    .map((body) => {
      const keys: string[] = []
      for (const match of body.matchAll(/['"]([^'"]+)['"]\s*:/g)) {
        if (match[1]) keys.push(match[1])
      }
      return keys
    })
    .filter((keys) => keys.length >= 2)
}

const containsPerRowDicts = (text: string): boolean =>
  dictKeyGroups(text).some((keys) => keys.some((key) => !isStatHeader(key)))

const isFrequencySeries = (text: string): boolean => {
  const name = text.match(/Name:\s*([^,\n]+),\s*dtype:\s*([A-Za-z0-9]+)/)
  if (!name) return false
  if (isStatHeader(name[1]?.trim() ?? '')) return true
  if (!/^int/i.test(name[2] ?? '')) return false
  const pairs = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('Name:') && /^\S+\s+\d+$/.test(line))
  if (pairs.length === 0) return false
  return !pairs.every((line) => /^\d+\s+\d+$/.test(line))
}

const containsRecordSeries = (text: string): boolean => {
  if (!/Name:\s*[^,\n]+,\s*dtype:/.test(text)) return false
  return !isFrequencySeries(text)
}

const containsSinglePatientFields = (text: string): boolean => {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  if (lines.length < 2) return false
  const keys = lines.map((line) => /^([^:：]{1,40})[:：]\s*\S/.exec(line)?.[1]?.trim() ?? '')
  if (keys.some((key) => key.length === 0 || /\s/.test(key))) return false
  if (keys.every((key) => isStatHeader(key))) return false
  return keys.filter((key) => !isStatHeader(key)).length >= 2
}

const collectTables = (text: string): ParsedTable[] => [
  ...parseMarkdownTables(text),
  ...parseDelimitedTables(text, ','),
  ...parseDelimitedTables(text, '\t'),
  ...parseWhitespaceFrames(text)
]

/** Which shape decision blocked the text. `null` means the text was released. */
export type PatientRowBlockBranch =
  | 'record-series'
  | 'per-row-dicts'
  | 'single-patient-fields'
  | 'non-aggregate-table'
  | null

/** Per-table shape only: no headers, no cells, no variable names. */
export type PatientRowTableShape = {
  rows: number
  columns: number
  statHeaders: number
  groupKeys: number
  describe: boolean
}

/**
 * Content-free attribution for a gate decision. Beta builds misjudged some complex aggregates, and
 * there was no record of which branch fired, so the gate now states its reasoning. Nothing here may
 * carry output text: only counts, booleans, the input length, and a truncated digest.
 */
export type PatientRowAttribution = {
  block: PatientRowBlockBranch
  textLength: number
  digest: string
  tables: number
  tableShapes: PatientRowTableShape[]
  describeTables: number
  frameFooter: boolean
  frequencySeries: boolean
}

const ATTRIBUTION_TABLE_LIMIT = 20

const digestOf = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12)

const hasFrameFooter = (text: string): boolean =>
  text.split('\n').some((line) => isFrameFooter(line))

const tableShape = (table: ParsedTable): PatientRowTableShape => {
  const headers = table.headers.map((header) => header.trim()).filter((header) => header.length > 0)
  const statHeaders = headers.filter((header) => isStatHeader(header)).length
  return {
    rows: table.rows.length,
    columns: headers.length,
    statHeaders,
    groupKeys: Math.max(headers.length - statHeaders, 0),
    describe: isDescribeTable(table)
  }
}

const emptyAttribution = (text: string, block: PatientRowBlockBranch): PatientRowAttribution => ({
  block,
  textLength: text.length,
  digest: digestOf(text),
  tables: 0,
  tableShapes: [],
  describeTables: 0,
  frameFooter: hasFrameFooter(text),
  frequencySeries: false
})

export type PatientRowDecision = {
  containsPatientRows: boolean
  attribution: PatientRowAttribution
}

/**
 * The same decision `notebookOutputContainsPatientRows` returns, plus the branch and shape metrics
 * that explain it. Keep the branch order in step with the predicate below.
 */
export const patientRowAttribution = (text: string): PatientRowDecision => {
  if (containsRecordSeries(text)) {
    return {
      containsPatientRows: true,
      attribution: { ...emptyAttribution(text, 'record-series'), frequencySeries: isFrequencySeries(text) }
    }
  }
  if (containsPerRowDicts(text)) {
    return { containsPatientRows: true, attribution: emptyAttribution(text, 'per-row-dicts') }
  }
  if (containsSinglePatientFields(text)) {
    return { containsPatientRows: true, attribution: emptyAttribution(text, 'single-patient-fields') }
  }
  const tables = collectTables(text)
  const shapes = tables.map(tableShape)
  const nonAggregate = tables.some((table) => !isAggregateTable(table))
  return {
    containsPatientRows: nonAggregate,
    attribution: {
      block: nonAggregate ? 'non-aggregate-table' : null,
      textLength: text.length,
      digest: digestOf(text),
      tables: tables.length,
      tableShapes: shapes.slice(0, ATTRIBUTION_TABLE_LIMIT),
      describeTables: shapes.filter((shape) => shape.describe).length,
      frameFooter: hasFrameFooter(text),
      frequencySeries: false
    }
  }
}

/** True when the text shows individual rows rather than an aggregate summary. */
export const notebookOutputContainsPatientRows = (text: string): boolean =>
  patientRowAttribution(text).containsPatientRows
