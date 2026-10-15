// De-identification gate for exported scripts, reports, and result tables.
// Likely karte numbers, birth dates, and individual patient values are flagged.
// Export proceeds only after the doctor confirms.

export type ExportFileKind = 'script' | 'report' | 'result-table' | 'other'

export type ExportFindingKind = 'karte-number' | 'birth-date' | 'individual-patient-value'

export type ExportFinding = {
  kind: ExportFindingKind
  fileKind: ExportFileKind
  name: string
  excerpt: string
  label: string
}

export const EXPORT_FINDING_LABEL: Record<ExportFindingKind, string> = {
  'karte-number': 'カルテ番号',
  'birth-date': '生年月日',
  'individual-patient-value': '個別の患者値'
}

const KARTE =
  /(?:カルテ(?:番号|No\.?|ID)?|患者(?:番号|ID)|チャート番号|chart\s*(?:number|no\.?)|MRN|PID|karte(?:_?no|_?id)?)\s*[=:：]?\s*["']?([A-Za-z]{0,4}-?\d{4,})/i
const BIRTH =
  /(?:生年月日|誕生日|生年月|date of birth|birth(?:_date|\s*date|date)|birthday|\bDOB\b)\s*[=:：]?\s*["']?(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?|(?:令和|平成|昭和)\d{1,2}年\d{1,2}月\d{1,2}日)/i
const CLINICAL =
  /(?:HbA1c|CRP|血圧|収縮期|拡張期|身長|体重|体温|AST|ALT|Cre|eGFR|WBC|\bHb\b|Plt|SBP|DBP|BMI|血糖|白血球|ヘモグロビン)\s*[=:：はが]?\s*\d+(?:\.\d+)?/i
const SENTENCE =
  /(?:患者|症例|patient|subject)\s*(?:番号|id|ID|No\.?)?\s*[:：]?\s*[0-9A-Za-z-]{4,}[^\n]{0,80}?(?<![A-Za-z])\d+(?:\.\d+)?(?![A-Za-z])/i
const FRAME =
  /(?:data\.frame|tibble|pd\.DataFrame)\s*\([^)\n]*?(?:karte|カルテ|patient_id|chart_no|生年月日|birth_date)[^)\n]*\)/i
const ID_HEADER = /カルテ|患者ID|患者番号|チャート|MRN|karte/i
const BIRTH_HEADER = /生年月日|誕生日|date of birth|birthdate|\bDOB\b/i
const CLINICAL_HEADER =
  /HbA1c|CRP|血圧|収縮期|身長|体重|体温|AST|ALT|Cre|eGFR|WBC|Hb|Plt|SBP|DBP|BMI|血糖/i

export const exportFileKind = (name: string): ExportFileKind => {
  if (/\.(py|r|ipynb)$/i.test(name)) return 'script'
  if (/\.(md|markdown|tex|txt|html|qmd|docx)$/i.test(name)) return 'report'
  if (/\.(csv|tsv|xlsx)$/i.test(name)) return 'result-table'
  return 'other'
}

const excerptOf = (value: string): string => value.replace(/\s+/g, ' ').trim().slice(0, 80)

const pushFinding = (
  findings: ExportFinding[],
  input: { name: string; kind: ExportFindingKind; excerpt: string }
): void => {
  const excerpt = excerptOf(input.excerpt)
  if (!excerpt) return
  if (findings.some((finding) => finding.kind === input.kind && finding.excerpt === excerpt)) return
  findings.push({
    kind: input.kind,
    fileKind: exportFileKind(input.name),
    name: input.name,
    excerpt,
    label: EXPORT_FINDING_LABEL[input.kind]
  })
}

const splitCells = (line: string, delimiter: string): string[] => {
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
      cells.push(current.trim())
      current = ''
    } else current += char
  }
  cells.push(current.trim())
  return cells
}

const inspectTable = (name: string, text: string, findings: ExportFinding[]): void => {
  const rawLines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (rawLines.length < 2) return
  const delimiter = name.toLowerCase().endsWith('.tsv') || rawLines[0]?.includes('\t') ? '\t' : ','
  if (!rawLines[0]?.includes(delimiter)) return
  const header = splitCells(rawLines[0] ?? '', delimiter)
  const idIndex = header.findIndex((cell) => ID_HEADER.test(cell))
  const birthIndex = header.findIndex((cell) => BIRTH_HEADER.test(cell))
  const clinicalIndexes = header.flatMap((cell, index) =>
    CLINICAL_HEADER.test(cell) ? [index] : []
  )
  for (const line of rawLines.slice(1, 8)) {
    const cells = splitCells(line, delimiter)
    if (idIndex >= 0 && /\d{4,}/.test(cells[idIndex] ?? '')) {
      pushFinding(findings, {
        name,
        kind: 'karte-number',
        excerpt: `${header[idIndex]} ${cells[idIndex]}`
      })
    }
    if (birthIndex >= 0 && /\d{4}[-/年]/.test(cells[birthIndex] ?? '')) {
      pushFinding(findings, {
        name,
        kind: 'birth-date',
        excerpt: `${header[birthIndex]} ${cells[birthIndex]}`
      })
    }
    const identifier = idIndex >= 0 ? (cells[idIndex] ?? '') : ''
    if (identifier && clinicalIndexes.some((index) => /\d/.test(cells[index] ?? ''))) {
      const clinical = clinicalIndexes.find((index) => /\d/.test(cells[index] ?? ''))
      pushFinding(findings, {
        name,
        kind: 'individual-patient-value',
        excerpt: `${identifier} ${header[clinical ?? 0]} ${cells[clinical ?? 0]}`
      })
    }
  }
}

const inspectLines = (name: string, text: string, findings: ExportFinding[]): void => {
  const lines = text.split(/\n/)
  lines.forEach((line, index) => {
    const karte = KARTE.exec(line)
    if (karte) {
      pushFinding(findings, { name, kind: 'karte-number', excerpt: karte[0] })
    }
    const birth = BIRTH.exec(line)
    if (birth) {
      pushFinding(findings, { name, kind: 'birth-date', excerpt: birth[0] })
    }
    const sentence = SENTENCE.exec(line)
    if (sentence) {
      pushFinding(findings, { name, kind: 'individual-patient-value', excerpt: sentence[0] })
    }
    const alreadyIndividual = findings.some(
      (finding) => finding.kind === 'individual-patient-value' && finding.name === name
    )
    const window = lines.slice(index, index + 4).join('\n')
    if (!alreadyIndividual && KARTE.test(window) && CLINICAL.test(window)) {
      pushFinding(findings, {
        name,
        kind: 'individual-patient-value',
        excerpt: window
      })
    }
  })
  const inline = text.match(
    /(?:患者ID|カルテ番号|MRN)[^\n]{0,40}\d{4,}[^\n]{0,40}(?:HbA1c|CRP|血圧|SBP|BMI)\s*[=:：は]?\s*\d+(?:\.\d+)?/i
  )
  if (inline) {
    pushFinding(findings, { name, kind: 'individual-patient-value', excerpt: inline[0] })
  }
}

export type ExportMatch = {
  kind: ExportFindingKind
  start: number
  end: number
}

const lineOffsets = (text: string): Array<{ start: number; line: string }> => {
  const lines: Array<{ start: number; line: string }> = []
  let start = 0
  for (const line of text.split('\n')) {
    lines.push({ start, line })
    start += line.length + 1
  }
  return lines
}

const pushMatch = (
  matches: ExportMatch[],
  kind: ExportFindingKind,
  start: number,
  end: number
): void => {
  if (end <= start) return
  if (matches.some((match) => match.kind === kind && match.start === start && match.end === end)) {
    return
  }
  matches.push({ kind, start, end })
}

const captureAt = (lineStart: number, match: RegExpExecArray, value: string): [number, number] => {
  const offset = match.index + match[0].lastIndexOf(value)
  return [lineStart + offset, lineStart + offset + value.length]
}

// Replacement spans for the same karte, birth-date, and individual-value findings.
// Multi-line windows stay in inspectExportFile and are not returned here.
export const locateExportMatches = (file: { name: string; text: string }): ExportMatch[] => {
  const matches: ExportMatch[] = []
  for (const { start, line } of lineOffsets(file.text)) {
    const karte = KARTE.exec(line)
    if (karte?.[1] != null) pushMatch(matches, 'karte-number', ...captureAt(start, karte, karte[1]))
    const birth = BIRTH.exec(line)
    if (birth?.[1] != null) pushMatch(matches, 'birth-date', ...captureAt(start, birth, birth[1]))
    const sentence = SENTENCE.exec(line)
    if (sentence?.index != null) {
      pushMatch(
        matches,
        'individual-patient-value',
        start + sentence.index,
        start + sentence.index + sentence[0].length
      )
    } else if (KARTE.test(line) && CLINICAL.test(line)) {
      pushMatch(matches, 'individual-patient-value', start, start + line.length)
    }
    const frame = FRAME.exec(line)
    if (frame?.index != null && /\d/.test(frame[0])) {
      pushMatch(
        matches,
        'individual-patient-value',
        start + frame.index,
        start + frame.index + frame[0].length
      )
    }
  }
  const rows = lineOffsets(file.text).filter(({ line }) => line.trim().length > 0)
  if (rows.length >= 2) {
    const delimiter =
      file.name.toLowerCase().endsWith('.tsv') || rows[0]?.line.includes('\t') ? '\t' : ','
    if (rows[0]?.line.includes(delimiter)) {
      const header = splitCells(rows[0]?.line ?? '', delimiter)
      const idIndex = header.findIndex((cell) => ID_HEADER.test(cell))
      const birthIndex = header.findIndex((cell) => BIRTH_HEADER.test(cell))
      const clinicalIndexes = header.flatMap((cell, index) =>
        CLINICAL_HEADER.test(cell) ? [index] : []
      )
      for (const row of rows.slice(1, 8)) {
        const cells = splitCells(row.line, delimiter)
        const identifier = idIndex >= 0 ? (cells[idIndex] ?? '') : ''
        const clinical = clinicalIndexes.some((index) => /\d/.test(cells[index] ?? ''))
        if (identifier && clinical) {
          pushMatch(matches, 'individual-patient-value', row.start, row.start + row.line.length)
          continue
        }
        if (idIndex >= 0 && /\d{4,}/.test(cells[idIndex] ?? '')) {
          const value = cells[idIndex] ?? ''
          const at = row.line.indexOf(value)
          if (at >= 0)
            pushMatch(matches, 'karte-number', row.start + at, row.start + at + value.length)
        }
        if (birthIndex >= 0 && /\d{4}[-/年]/.test(cells[birthIndex] ?? '')) {
          const value = cells[birthIndex] ?? ''
          const at = row.line.indexOf(value)
          if (at >= 0)
            pushMatch(matches, 'birth-date', row.start + at, row.start + at + value.length)
        }
      }
    }
  }
  return matches
}

export const inspectExportFile = (file: { name: string; text: string }): ExportFinding[] => {
  const findings: ExportFinding[] = []
  inspectLines(file.name, file.text, findings)
  inspectTable(file.name, file.text, findings)
  return findings
}

export type ExportRelease = { ok: true } | { ok: false; findings: ExportFinding[] }

export const releaseExport = (input: {
  name: string
  text: string
  confirmed?: boolean
}): ExportRelease => {
  const findings = inspectExportFile({ name: input.name, text: input.text })
  if (findings.length === 0 || input.confirmed === true) return { ok: true }
  return { ok: false, findings }
}

export const releaseExportSet = (
  files: readonly { name: string; text: string }[],
  confirmed?: boolean
): ExportRelease => {
  const findings = files.flatMap((file) => inspectExportFile(file))
  if (findings.length === 0 || confirmed === true) return { ok: true }
  return { ok: false, findings }
}
