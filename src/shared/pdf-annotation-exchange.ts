import {
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRef,
  PDFArray,
  PDFRawStream
} from 'pdf-lib'
import { sanitizePdfDocumentTarget, type PdfBookmarkTextSelector } from './pdf-bookmarks'

export const PDF_TEXT_RANGE_KEY = 'BaselioTextRange'
// The page number, normalized geometry and half-open UTF-16 source offsets are independent.
// Keep the captured exact text verbatim; neither geometry nor a later extractor defines it.
export type PdfStoredTextRange = {
  version: 1
  fingerprint: string
  selector: PdfBookmarkTextSelector
}
const digest = async (text: string | Uint8Array): Promise<string> =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        typeof text === 'string' ? new TextEncoder().encode(text) : new Uint8Array(text)
      )
    ),
    (byte) => byte.toString(16).padStart(2, '0')
  ).join('')

// Hash the page content/resources/boxes, excluding annotation dictionaries and page-tree links.
// Rewriting only annotations therefore preserves identity; changing text, fonts, images or boxes
// does not. Object numbers are deliberately excluded, since a PDF editor may renumber them.
export const pdfAnnotationDocumentFingerprint = async (document: PDFDocument): Promise<string> => {
  const streamDigests = new WeakMap<PDFRawStream, Promise<string>>()
  const visit = async (object: unknown, ancestors: ReadonlySet<unknown>): Promise<unknown> => {
    if (object instanceof PDFRef) object = document.context.lookup(object)
    if (ancestors.has(object)) return 'cycle'
    const seen = new Set(ancestors).add(object)
    if (object instanceof PDFRawStream) {
      let hash = streamDigests.get(object)
      if (!hash) {
        hash = digest(object.getContents())
        streamDigests.set(object, hash)
      }
      return [await visit(object.dict, seen), await hash]
    }
    if (object instanceof PDFArray)
      return Promise.all(object.asArray().map((entry) => visit(entry, seen)))
    if (object instanceof PDFDict) {
      const entries = object
        .entries()
        .filter(([key]) => !['/Annots', '/Parent', '/Length'].includes(key.toString()))
        .sort(([a], [b]) => a.toString().localeCompare(b.toString()))
      return Promise.all(
        entries.map(async ([key, value]) => [key.toString(), await visit(value, seen)])
      )
    }
    return String(object)
  }
  return digest(
    JSON.stringify(
      await Promise.all(
        document
          .getPages()
          .map(async (page) => [
            await visit(page.node, new Set()),
            await visit(page.node.Resources(), new Set()),
            page.getMediaBox(),
            page.getCropBox(),
            page.getRotation()
          ])
      )
    )
  )
}

export const parsePdfStoredTextRange = (text: string): PdfStoredTextRange | undefined => {
  if (new TextEncoder().encode(text).byteLength > 65_536) return undefined
  try {
    const value = JSON.parse(text) as PdfStoredTextRange
    if (
      !value ||
      Object.keys(value).some((key) => !['version', 'fingerprint', 'selector'].includes(key)) ||
      value.version !== 1 ||
      !/^[a-f0-9]{64}$/u.test(value.fingerprint) ||
      value.selector?.kind !== 'text'
    )
      return undefined
    const target = sanitizePdfDocumentTarget({
      kind: 'pdf',
      source: {
        kind: 'upload-version',
        projectId: 'validation',
        sourceFileId: 'validation',
        versionId: 'validation',
        checksum: 'a'.repeat(64),
        name: 'validation.pdf',
        path: '/validation.pdf'
      },
      selector: value.selector
    })
    return target?.selector.kind === 'text'
      ? { version: 1, fingerprint: value.fingerprint, selector: target.selector }
      : undefined
  } catch {
    return undefined
  }
}

export const pdfStoredTextRanges = async (
  data: Uint8Array
): Promise<Map<string, PdfStoredTextRange | undefined>> => {
  const ranges = new Map<string, PdfStoredTextRange | undefined>()
  const document = await PDFDocument.load(data, { updateMetadata: false })
  const candidates: Array<[string, string, number]> = []
  for (const [pageIndex, page] of document.getPages().entries()) {
    const annotations = page.node.Annots()
    if (!annotations) continue
    for (const ref of annotations.asArray()) {
      const annotation = document.context.lookup(ref)
      if (!(ref instanceof PDFRef) || !(annotation instanceof PDFDict)) continue
      const raw = annotation.get(PDFName.of(PDF_TEXT_RANGE_KEY))
      if (!raw) continue
      const id = `${ref.objectNumber}R${ref.generationNumber || ''}`
      ranges.set(id, undefined)
      if (raw instanceof PDFHexString) candidates.push([id, raw.decodeText(), pageIndex + 1])
    }
  }
  if (!candidates.length) return ranges
  const fingerprint = await pdfAnnotationDocumentFingerprint(document)
  for (const [id, text, pageNumber] of candidates) {
    const range = parsePdfStoredTextRange(text)
    if (range)
      ranges.set(id, {
        ...range,
        selector: {
          ...range.selector,
          ...(range.fingerprint !== fingerprint || range.selector.pageNumber !== pageNumber
            ? { attachmentState: 'needs-review' as const }
            : {})
        }
      })
  }
  return ranges
}
