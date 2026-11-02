import { expect, it } from 'vitest'
import { PDFDocument, PDFDict, PDFHexString, PDFName } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { exportAnnotatedPdf } from './pdf-export'
import { preparePdfExportMarks } from './pdf-export-prepare'
import { parseNativePdfAnnotationsOnCurrentThread } from '../../../../../main/pdf-annotations/native-import-core'
import { PDF_TEXT_RANGE_KEY } from '../../../../../shared/pdf-annotation-exchange'
import { pdfAnnotationSchema, type PdfAnnotation } from '../../../../../shared/pdf-annotations'
import { indexPdfAnnotations, pdfAnnotationSourceKey } from './pdf-annotation-index'

const exact = '  日本語の選択  '
const sourceText = `前文${exact}後文`
const start = sourceText.indexOf(exact)
const checksum = async (data: ArrayBuffer): Promise<string> =>
  Buffer.from(await crypto.subtle.digest('SHA-256', data)).toString('hex')

const fixture = async (): Promise<{ data: ArrayBuffer; annotation: PdfAnnotation }> => {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(
    await readFile('packages/pdf-translation/resources/NotoSansSC-Regular.otf'),
    { subset: true }
  )
  doc.addPage([600, 800])
  const page = doc.addPage([600, 800])
  page.drawText(sourceText, { x: 60, y: 700, size: 12, font })
  const x = 60 + font.widthOfTextAtSize(sourceText.slice(0, start), 12)
  const width = font.widthOfTextAtSize(exact, 12)
  const data = (await doc.save()).buffer as ArrayBuffer
  const annotation = pdfAnnotationSchema.parse({
    id: 'japanese',
    version: 1,
    origin: 'user',
    projectId: 'project',
    kind: 'highlight',
    note: '',
    tagIds: [],
    createdAt: '2026-11-02T00:00:00Z',
    updatedAt: '2026-11-02T00:00:00Z',
    target: {
      source: {
        kind: 'upload-version',
        projectId: 'project',
        sourceFileId: 'file',
        versionId: 'version',
        checksum: await checksum(data),
        path: '/source.pdf',
        name: 'source.pdf'
      },
      selector: {
        kind: 'text',
        pageNumber: 2,
        pageRotation: 0,
        coordinateVersion: 1,
        exact,
        position: { start, end: start + exact.length },
        extractorVersion: 'pdfjs-page-text-v1',
        quads: [{ x: x / 600, y: (800 - 704) / 800, width: width / 600, height: 12 / 800 }]
      }
    }
  })
  return { data, annotation }
}

const exported = async (
  input?: Awaited<ReturnType<typeof fixture>>
): Promise<{ data: ArrayBuffer; annotation: PdfAnnotation }> => {
  const { data, annotation } = input ?? (await fixture())
  const pdf = await getDocument({ data: new Uint8Array(data.slice(0)), verbosity: 0 }).promise
  try {
    const marks = await preparePdfExportMarks(
      pdf,
      [annotation],
      new AbortController().signal,
      (item) => item.note
    )
    expect(marks[0].pageNumber).toBe(2)
    return {
      data: await exportAnnotatedPdf({ data, checksum: await checksum(data), marks }),
      annotation
    }
  } finally {
    await pdf.destroy()
  }
}

const imported = async (
  data: ArrayBuffer
): Promise<
  import('../../../../../main/pdf-annotations/native-import-core').NativePdfAnnotationImportResult
> => {
  const directory = await mkdtemp(join(tmpdir(), 'annotation-range-'))
  try {
    const path = join(directory, 'export.pdf')
    await writeFile(path, new Uint8Array(data))
    return await parseNativePdfAnnotationsOnCurrentThread(path)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
const extraction = async (data: ArrayBuffer): Promise<unknown> => {
  const pdf = await getDocument({ data: new Uint8Array(data.slice(0)), verbosity: 0 }).promise
  try {
    return (await (await pdf.getPage(2)).getTextContent()).items.map((item) => {
      if (!('str' in item)) return item
      return {
        str: item.str,
        transform: item.transform,
        width: item.width,
        height: item.height,
        dir: item.dir,
        hasEOL: item.hasEOL
      }
    })
  } finally {
    await pdf.destroy()
  }
}

it('round trips the Japanese excerpt bytes, explicit source offsets, page and geometry', async () => {
  const { data, annotation } = await exported()
  const result = await imported(data)
  expect(result.unsupportedCount).toBe(0)
  const selector = result.annotations[0]?.selector
  expect(selector?.kind).toBe('text')
  if (selector?.kind !== 'text') throw new Error('Missing text range')
  expect(Buffer.from(selector.exact)).toEqual(Buffer.from(exact))
  expect(selector).toEqual(annotation.target.selector)
  expect(selector.pageNumber).toBe(2)
})

it('preserves leading and trailing selection spaces without normalizing them', async () => {
  const { data } = await exported()
  const selector = (await imported(data)).annotations[0]?.selector
  expect(selector?.kind === 'text' && selector.exact).toBe(exact)
  expect(
    selector?.kind === 'text' && sourceText.slice(selector.position.start, selector.position.end)
  ).toBe(exact)
})

it('shows the loss is serialization/import, with identical extraction before and after export', async () => {
  const original = await fixture()
  const result = await exported(original)
  expect(await extraction(result.data)).toEqual(await extraction(original.data))
})

it('keeps annotations on modified content unattached and excludes them from page highlights', async () => {
  const { data, annotation } = await exported()
  const doc = await PDFDocument.load(data)
  doc.getPage(1).drawText('Modified document', { x: 20, y: 20 })
  const result = await imported((await doc.save()).buffer as ArrayBuffer)
  const selector = result.annotations[0]?.selector
  expect(selector).toEqual({ ...annotation.target.selector, attachmentState: 'needs-review' })
  const restored = pdfAnnotationSchema.parse({
    ...annotation,
    origin: 'imported',
    target: { ...annotation.target, selector }
  })
  const index = indexPdfAnnotations([restored]).get(pdfAnnotationSourceKey(restored.target.source))!
  expect(index.annotations).toHaveLength(1)
  expect(index.pages.size).toBe(0)
})

it('demonstrates the legacy failure if the explicit stored range is removed', async () => {
  const { data } = await exported()
  const doc = await PDFDocument.load(data)
  const annotation = doc.context.lookup(doc.getPage(1).node.Annots()!.get(0), PDFDict)
  annotation.delete(PDFName.of(PDF_TEXT_RANGE_KEY))
  const result = await imported((await doc.save()).buffer as ArrayBuffer)
  expect(result.annotations[0]?.selector).not.toMatchObject({
    exact,
    position: { start, end: start + exact.length }
  })
})

it('rejects a malformed saved offset instead of re-extracting a nearby quotation', async () => {
  const { data } = await exported()
  const doc = await PDFDocument.load(data)
  const annotation = doc.context.lookup(doc.getPage(1).node.Annots()!.get(0), PDFDict)
  const raw = annotation.lookup(PDFName.of(PDF_TEXT_RANGE_KEY), PDFHexString)
  const value = JSON.parse(raw.decodeText())
  value.selector.position.end += 1
  annotation.set(PDFName.of(PDF_TEXT_RANGE_KEY), PDFHexString.fromText(JSON.stringify(value)))
  const result = await imported((await doc.save()).buffer as ArrayBuffer)
  expect(result.annotations).toEqual([])
  expect(result.unsupportedCount).toBe(1)
})
