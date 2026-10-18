import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'

import { unzipSync } from 'fflate'

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
const extractHeadingCandidates = (xml: string): string[] => {
  const candidates: string[] = []
  for (const match of xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/gu)) {
    const paragraphXml = match[1]
    const text = extractWordText(paragraphXml).replaceAll('\n', '').trim()
    if (!text || text.length > 160) continue
    const hasHeadingStyle = /<w:pStyle\b[^>]*w:val=["'](?:Heading\d*|見出し\d*)["']/iu.test(
      paragraphXml
    )
    if (hasHeadingStyle || /<w:numPr\b/iu.test(paragraphXml) || numberedHeading.test(text)) {
      candidates.push(text)
    }
  }
  for (const table of xml.matchAll(/<w:tbl(?:\s[^>]*)?>([\s\S]*?)<\/w:tbl>/gu)) {
    const firstRow = /<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/u.exec(table[1])?.[1]
    if (!firstRow) continue
    for (const cell of firstRow.matchAll(/<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/gu)) {
      const text = extractWordText(cell[1]).replaceAll('\n', '').trim()
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
    headings: extractHeadingCandidates(new TextDecoder().decode(entries['word/document.xml']))
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
