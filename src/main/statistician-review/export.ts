import {
  applyManualSpans,
  type PhiConfirmer,
  type PhiHighlight,
  type PhiPreview
} from '../phi/confirm'
import { createMemoryPhiVault } from '../phi/store'
import {
  parseStatisticianReviewExportRequest,
  type StatisticianReviewExportFile,
  type StatisticianReviewExportRequest,
  type StatisticianReviewExportResponse
} from '../../shared/statistician-review-export'
import {
  buildDocx,
  buildPdf,
  buildResultWorkbook,
  sheetsFromConfirmedText,
  sheetText
} from './files'
import { redactExportText, redactResultSheet, remainingExportFindings } from './redact'

type Part = {
  kind: StatisticianReviewExportFile['kind']
  filename: string
  mediaType: string
  text: string
  highlights: PhiHighlight[]
}

const SCRIPT_NOTE = '# Aggregate analysis script for statistician review.\n'

const partsFor = (request: StatisticianReviewExportRequest): Part[] => {
  const store = createMemoryPhiVault().store(request.projectId)
  const report = redactExportText(
    `${request.statisticalReport.title}\n\n${request.statisticalReport.body}`,
    store
  )
  const sheets = request.resultTables.sheets.map((sheet) => redactResultSheet(sheet, store))
  const tableText = sheets.map(sheetText).join('\n\n')
  const table = redactExportText(tableText, store)
  const script = redactExportText(`${SCRIPT_NOTE}${request.analysisScript.source}`, store)
  const definition = redactExportText(
    request.variableDefinition.rows
      .map((row) => [row.name, row.definition, row.type, row.coding].join('\t'))
      .join('\n'),
    store
  )
  const log = redactExportText(request.executionLog.text, store)
  const reportName =
    request.statisticalReport.format === 'docx'
      ? 'statistical-report.docx'
      : 'statistical-report.pdf'
  const scriptName = request.analysisScript.language === 'r' ? 'analysis.R' : 'analysis.py'
  return [
    {
      kind: 'statistical-report',
      filename: reportName,
      mediaType:
        request.statisticalReport.format === 'docx'
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/pdf',
      text: report.text,
      highlights: report.highlights
    },
    {
      kind: 'result-tables',
      filename: 'result-tables.xlsx',
      mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      text: table.text,
      highlights: table.highlights
    },
    {
      kind: 'analysis-script',
      filename: scriptName,
      mediaType: 'text/plain',
      text: script.text,
      highlights: script.highlights
    },
    {
      kind: 'variable-definition',
      filename: 'variable-definition.pdf',
      mediaType: 'application/pdf',
      text: definition.text,
      highlights: definition.highlights
    },
    {
      kind: 'execution-log',
      filename: 'execution-log.pdf',
      mediaType: 'application/pdf',
      text: log.text,
      highlights: log.highlights
    }
  ]
}

const previewOf = (parts: readonly Part[]): { preview: PhiPreview; starts: number[] } => {
  const starts: number[] = []
  let text = ''
  const highlights: PhiHighlight[] = []
  for (const part of parts) {
    if (text.length > 0) text += '\n\n'
    const header = `# ${part.filename}\n`
    const start = text.length + header.length
    starts.push(start)
    text += header + part.text
    for (const highlight of part.highlights) {
      highlights.push({
        start: highlight.start + start,
        end: highlight.end + start,
        category: highlight.category
      })
    }
  }
  return { preview: { text, highlights }, starts }
}

const applyExtras = (
  parts: Part[],
  starts: readonly number[],
  extras: readonly { start: number; end: number }[],
  placeholder: (original: string) => string
): Part[] | null => {
  const grouped = parts.map(() => [] as Array<{ start: number; end: number }>)
  for (const span of extras) {
    const index = parts.findIndex((_, partIndex) => {
      const start = starts[partIndex]
      const end = start + parts[partIndex].text.length
      return span.start >= start && span.end <= end
    })
    if (index < 0) return null
    grouped[index].push({ start: span.start - starts[index], end: span.end - starts[index] })
  }
  return parts.map((part, index) => {
    const marks = grouped[index]
    if (marks.length === 0) return part
    const text = applyManualSpans(part.text, marks, placeholder)
    return { ...part, text, highlights: [] }
  })
}

const bytesFor = async (
  part: Part,
  request: StatisticianReviewExportRequest
): Promise<Uint8Array> => {
  if (part.kind === 'statistical-report' && request.statisticalReport.format === 'docx') {
    return buildDocx(part.text)
  }
  if (part.kind === 'result-tables') return buildResultWorkbook(sheetsFromConfirmedText(part.text))
  if (part.kind === 'analysis-script') return new TextEncoder().encode(part.text)
  if (part.kind === 'statistical-report' && request.statisticalReport.format === 'pdf') {
    const [title, ...rest] = part.text.split('\n')
    return buildPdf(title || part.filename, rest.join('\n'))
  }
  return buildPdf(part.filename.replace(/\.pdf$/i, ''), part.text)
}

export const exportStatisticianReviewPackage = async (
  value: unknown,
  options: { confirm: PhiConfirmer }
): Promise<StatisticianReviewExportResponse> => {
  const parsed = parseStatisticianReviewExportRequest(value)
  if (!parsed.ok) return parsed
  let parts = partsFor(parsed.request)
  if (parts.some((part) => remainingExportFindings(part.text).length > 0)) {
    return { ok: false, code: 'deidentify-failed' }
  }
  const bundled = previewOf(parts)
  let decision
  try {
    decision = await options.confirm(bundled.preview)
  } catch {
    return { ok: false, code: 'not-confirmed' }
  }
  if (!decision?.confirmed) return { ok: false, code: 'not-confirmed' }
  if (decision.extraSpans && decision.extraSpans.length > 0) {
    const store = createMemoryPhiVault().store(`${parsed.request.projectId}:manual`)
    const marked = applyExtras(parts, bundled.starts, decision.extraSpans, (original) =>
      store.manual(original)
    )
    if (!marked) return { ok: false, code: 'invalid' }
    parts = marked
    if (parts.some((part) => remainingExportFindings(part.text).length > 0)) {
      return { ok: false, code: 'deidentify-failed' }
    }
  }
  const files: StatisticianReviewExportFile[] = []
  for (const part of parts) {
    const bytes = await bytesFor(part, parsed.request)
    files.push({
      kind: part.kind,
      filename: part.filename,
      mediaType: part.mediaType,
      text: part.text,
      base64: Buffer.from(bytes).toString('base64')
    })
  }
  const filenames = files.map((file) => file.filename)
  if (
    filenames.some((name) => /\.(csv|tsv|ipynb|html|json)$/i.test(name)) ||
    new Set(files.map((file) => file.kind)).size !== files.length
  ) {
    return { ok: false, code: 'forbidden' }
  }
  return { ok: true, files }
}
