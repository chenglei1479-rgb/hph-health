/**
 * Beta export for the statistician review deliverable (consultation-pack).
 * Files open without DRA. Raw data, individual Notebook rows, and chat history
 * are not kinds and are not accepted as request fields.
 */

export const BETA_STATISTICIAN_EXPORT_KINDS = [
  'statistical-report',
  'result-tables',
  'analysis-script',
  'variable-definition',
  'execution-log'
] as const

export type StatisticianExportKind = (typeof BETA_STATISTICIAN_EXPORT_KINDS)[number]

export const BETA_FORBIDDEN_STATISTICIAN_EXPORTS = [
  'raw-data',
  'notebook-individual-rows',
  'chat-history'
] as const

export type StatisticianExportCode =
  'forbidden' | 'invalid' | 'small-cell-mask' | 'not-confirmed' | 'deidentify-failed'

export type StatisticianReportFormat = 'docx' | 'pdf'

export type StatisticianScriptLanguage = 'r' | 'python'

export type StatisticianResultCell = string | number | null

export type StatisticianResultSheet = {
  name: string
  columns: string[]
  rows: StatisticianResultCell[][]
}

export type StatisticianVariableRow = {
  name: string
  definition: string
  type: string
  coding: string
}

export type StatisticianReviewExportRequest = {
  projectId: string
  statisticalReport: {
    format: StatisticianReportFormat
    title: string
    body: string
  }
  resultTables: {
    sheets: StatisticianResultSheet[]
  }
  analysisScript: {
    language: StatisticianScriptLanguage
    source: string
  }
  variableDefinition: {
    rows: StatisticianVariableRow[]
  }
  executionLog: {
    text: string
  }
}

export type StatisticianReviewExportFile = {
  kind: StatisticianExportKind
  filename: string
  mediaType: string
  text: string
  base64: string
}

export type StatisticianReviewExportResponse =
  { ok: true; files: StatisticianReviewExportFile[] } | { ok: false; code: StatisticianExportCode }

const ALLOWED_KEYS = new Set([
  'projectId',
  'statisticalReport',
  'resultTables',
  'analysisScript',
  'variableDefinition',
  'executionLog'
])

const FORBIDDEN_KEYS = new Set([
  'rawData',
  'raw-data',
  'notebook',
  'notebookOutput',
  'notebookRows',
  'notebookIndividualRows',
  'chat',
  'chatHistory',
  'conversation',
  'messages',
  'includeRawData',
  'includeNotebook',
  'includeChat',
  'includeChatHistory'
])

const SMALL_CELL_MASK = /^(?:<\s*10(?:\s*(?:人|例|件))?|n\s*<\s*10|≤\s*10|10\s*未満)$/i

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const textOf = (value: unknown): string | null => (typeof value === 'string' ? value.trim() : null)

export const parseResultTableTsv = (tsv: string): StatisticianResultSheet | null => {
  const lines = tsv
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
  if (lines.length < 2) return null
  const columns = lines[0].split('\t').map((cell) => cell.trim())
  if (columns.length === 0 || columns.some((cell) => cell.length === 0)) return null
  const rows = lines.slice(1).map((line) =>
    line.split('\t').map((cell): StatisticianResultCell => {
      const trimmed = cell.trim()
      if (trimmed.length === 0) return null
      if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed)
      return trimmed
    })
  )
  if (rows.some((row) => row.length !== columns.length)) return null
  return { name: 'results', columns, rows }
}

export const parseVariableDefinitionTsv = (tsv: string): StatisticianVariableRow[] | null => {
  const lines = tsv
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  if (lines.length === 0) return null
  const rows: StatisticianVariableRow[] = []
  for (const line of lines) {
    const [name, definition, type, coding] = line.split('\t')
    if (!name?.trim() || !definition?.trim()) return null
    rows.push({
      name: name.trim(),
      definition: definition.trim(),
      type: (type ?? '').trim(),
      coding: (coding ?? '').trim()
    })
  }
  return rows
}

const cellIsMasked = (cell: StatisticianResultCell): boolean =>
  typeof cell === 'string' && SMALL_CELL_MASK.test(cell.trim())

const parseSheet = (value: unknown): StatisticianResultSheet | null => {
  if (!isRecord(value) || !Array.isArray(value.columns) || !Array.isArray(value.rows)) return null
  const name = textOf(value.name)
  const columns = value.columns.map((column) => textOf(column))
  if (!name || columns.some((column) => !column)) return null
  const rows: StatisticianResultCell[][] = []
  for (const row of value.rows) {
    if (!Array.isArray(row) || row.length !== columns.length) return null
    const cells: StatisticianResultCell[] = []
    for (const cell of row) {
      if (cell == null) cells.push(null)
      else if (typeof cell === 'number' && Number.isFinite(cell)) cells.push(cell)
      else if (typeof cell === 'string') cells.push(cell)
      else return null
    }
    rows.push(cells)
  }
  return { name, columns: columns as string[], rows }
}

export const parseStatisticianReviewExportRequest = (
  value: unknown
):
  | { ok: true; request: StatisticianReviewExportRequest }
  | { ok: false; code: StatisticianExportCode } => {
  if (!isRecord(value)) return { ok: false, code: 'invalid' }
  if (Object.keys(value).some((key) => FORBIDDEN_KEYS.has(key)))
    return { ok: false, code: 'forbidden' }
  if (Object.keys(value).some((key) => !ALLOWED_KEYS.has(key)))
    return { ok: false, code: 'invalid' }
  const projectId = textOf(value.projectId)
  const report = isRecord(value.statisticalReport) ? value.statisticalReport : null
  const tables = isRecord(value.resultTables) ? value.resultTables : null
  const script = isRecord(value.analysisScript) ? value.analysisScript : null
  const definition = isRecord(value.variableDefinition) ? value.variableDefinition : null
  const log = isRecord(value.executionLog) ? value.executionLog : null
  const format = report ? textOf(report.format) : null
  const language = script ? textOf(script.language) : null
  const title = report ? textOf(report.title) : null
  const body = report && typeof report.body === 'string' ? report.body.trim() : null
  const source = script && typeof script.source === 'string' ? script.source.trim() : null
  const logText = log && typeof log.text === 'string' ? log.text.trim() : null
  if (!projectId || !title || !body || !source || !logText) return { ok: false, code: 'invalid' }
  if (format !== 'docx' && format !== 'pdf') return { ok: false, code: 'invalid' }
  if (language !== 'r' && language !== 'python') return { ok: false, code: 'invalid' }
  if (!tables || !Array.isArray(tables.sheets) || tables.sheets.length === 0) {
    return { ok: false, code: 'invalid' }
  }
  const sheets = tables.sheets.map(parseSheet)
  if (sheets.some((sheet) => sheet == null || sheet.rows.length === 0)) {
    return { ok: false, code: 'invalid' }
  }
  const parsedSheets = sheets as StatisticianResultSheet[]
  if (parsedSheets.some((sheet) => sheet.rows.some((row) => row.some(cellIsMasked)))) {
    return { ok: false, code: 'small-cell-mask' }
  }
  if (!definition || !Array.isArray(definition.rows) || definition.rows.length === 0) {
    return { ok: false, code: 'invalid' }
  }
  const rows: StatisticianVariableRow[] = []
  for (const row of definition.rows) {
    if (!isRecord(row)) return { ok: false, code: 'invalid' }
    const name = textOf(row.name)
    const definitionText = textOf(row.definition)
    const type = typeof row.type === 'string' ? row.type.trim() : null
    const coding = typeof row.coding === 'string' ? row.coding.trim() : null
    if (!name || !definitionText || type == null || coding == null)
      return { ok: false, code: 'invalid' }
    rows.push({ name, definition: definitionText, type, coding })
  }
  return {
    ok: true,
    request: {
      projectId,
      statisticalReport: { format, title, body },
      resultTables: { sheets: parsedSheets },
      analysisScript: { language, source },
      variableDefinition: { rows },
      executionLog: { text: logText }
    }
  }
}
