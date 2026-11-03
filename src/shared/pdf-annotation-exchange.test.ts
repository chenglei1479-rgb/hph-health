import { PDFDocument, PDFName, PDFHexString } from 'pdf-lib'
import { expect, it } from 'vitest'
import { pdfAnnotationDocumentFingerprint } from './pdf-annotation-exchange'

it('keeps the document fingerprint stable across annotation-only edits and PDF rewrites', async () => {
  const source = await PDFDocument.create()
  source.addPage([600, 800]).drawText('Source text', { x: 60, y: 700 })
  // Both production callers fingerprint a loaded PDF, after its content streams are serialized.
  const document = await PDFDocument.load(await source.save())
  const page = document.getPage(0)
  const before = await pdfAnnotationDocumentFingerprint(document)
  expect(await pdfAnnotationDocumentFingerprint(document)).toBe(before)
  const annotation = document.context.register(
    document.context.obj({
      Type: 'Annot',
      Subtype: 'Highlight',
      Rect: [60, 690, 160, 710],
      QuadPoints: [60, 710, 160, 710, 60, 690, 160, 690],
      Contents: PDFHexString.fromText('Added note')
    })
  )
  page.node.set(PDFName.of('Annots'), document.context.obj([annotation]))
  expect(await pdfAnnotationDocumentFingerprint(document)).toBe(before)
  const rewritten = await PDFDocument.load(await document.save())
  expect(await pdfAnnotationDocumentFingerprint(rewritten)).toBe(before)
  rewritten.getPage(0).drawText('Content changed', { x: 60, y: 600 })
  expect(await pdfAnnotationDocumentFingerprint(rewritten)).not.toBe(before)
})
