import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'

import { unzipSync } from 'fflate'
import { detectPhi, type PhiSpan } from '../phi/detect'

export const DOCX_ONLY_MESSAGE =
  'β では .docx 形式の書式のみ対応しています。Word で .docx として保存してから再度アップロードしてください。'

export type DocxTextPart = { path: string; text: string }
export type DocxInspection = { sha256: string; parts: DocxTextPart[]; headings: string[] }

const textPart = /^word\/(?:document|header\d+|footer\d+|footnotes|comments)\.xml$/u
const decodeXml = (value: string): string =>
  value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')

const extractWordText = (xml: string): string =>
  [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gu)]
    .map((match) => decodeXml(match[1]))
    .join('\n')

const numberedHeading =
  /^(?:第?\s*\d+\s*[章節項.)．、:：]|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕]|[（(]\s*\d+\s*[）)])\s*/u
const headingStyleName = /^(?:Heading|見出し)\s*[1-9]$/iu
const extractHeadingStyleIds = (stylesXml: string): Set<string> => {
  const ids = new Set<string>()
  for (const style of stylesXml.matchAll(/<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/gu)) {
    const id = /\bw:styleId=["']([^"']+)["']/u.exec(style[1])?.[1]
    const name = /<w:name\b[^>]*\bw:val=["']([^"']+)["']/u.exec(style[2])?.[1]
    if (id && name && headingStyleName.test(decodeXml(name))) ids.add(decodeXml(id))
  }
  return ids
}

const extractHeadingCandidates = (xml: string, headingStyleIds: ReadonlySet<string>): string[] => {
  const candidates: string[] = []
  const xmlWithoutTables = xml.replace(/<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/gu, '')
  for (const match of xmlWithoutTables.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/gu)) {
    const paragraphXml = match[1]
    const text = extractWordText(paragraphXml).replaceAll('\n', '').trim()
    if (!text) continue
    const styleId = /<w:pStyle\b[^>]*w:val=["']([^"']+)["']/iu.exec(paragraphXml)?.[1]
    const hasHeadingStyle = Boolean(
      styleId && (headingStyleName.test(styleId) || headingStyleIds.has(styleId))
    )
    const looksNumbered = /<w:numPr\b/iu.test(paragraphXml) || numberedHeading.test(text)
    if (hasHeadingStyle && text.length <= 160) {
      candidates.push(text)
    } else if (looksNumbered && text.length <= 60 && !text.endsWith('。')) {
      candidates.push(text)
    }
  }
  for (const table of xml.matchAll(/<w:tbl(?:\s[^>]*)?>([\s\S]*?)<\/w:tbl>/gu)) {
    const rows = [...table[1].matchAll(/<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/gu)].map((row) =>
      [...row[1].matchAll(/<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/gu)].map((cell) =>
        extractWordText(cell[1]).replaceAll('\n', '').trim()
      )
    )
    const cellsToKeep =
      rows.length > 0 && rows.every((row) => row.length === 2)
        ? rows.map((row) => row[0])
        : (rows[0] ?? [])
    for (const text of cellsToKeep) {
      if (text && text.length <= 160) candidates.push(text)
    }
  }
  return [...new Set(candidates)]
}

export const inspectDocx = (filePath: string): DocxInspection => {
  if (extname(filePath).toLowerCase() !== '.docx') throw new Error(DOCX_ONLY_MESSAGE)
  const bytes = readFileSync(filePath)
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes)
  } catch {
    throw new Error(DOCX_ONLY_MESSAGE)
  }
  if (!entries['[Content_Types].xml'] || !entries['word/document.xml']) {
    throw new Error(DOCX_ONLY_MESSAGE)
  }
  const parts = Object.entries(entries)
    .filter(([path]) => textPart.test(path))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, contents]) => ({
      path,
      text: extractWordText(new TextDecoder().decode(contents))
    }))
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    parts,
    headings: extractHeadingCandidates(
      new TextDecoder().decode(entries['word/document.xml']),
      extractHeadingStyleIds(
        entries['word/styles.xml'] ? new TextDecoder().decode(entries['word/styles.xml']) : ''
      )
    )
  }
}

type HeadingScan = (text: string) => PhiSpan[] | Promise<PhiSpan[]>

export const inspectPhiSafeDocxHeadings = async (
  filePath: string,
  options: { scan?: HeadingScan; timeoutMs?: number } = {}
): Promise<string[]> => {
  const headings = inspectDocx(filePath).headings
  const scan = options.scan ?? detectPhi
  const timeoutMs = options.timeoutMs ?? 5_000
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const results = await Promise.race([
      Promise.all(headings.map(async (heading) => scan(heading))),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('DOCX heading PHI scan timed out')), timeoutMs)
      })
    ])
    return headings.filter((_, index) => results[index].length === 0)
  } catch {
    throw new Error('DOCX heading PHI scan failed closed.')
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export const copyDocxToProject = (source: string, projectDirectory: string): string => {
  const before = inspectDocx(source).sha256
  const destination = join(projectDirectory, 'ethics-protocol', basename(source))
  mkdirSync(dirname(destination), { recursive: true })
  copyFileSync(source, destination)
  if (inspectDocx(source).sha256 !== before)
    throw new Error('The source DOCX changed during import.')
  return destination
}
