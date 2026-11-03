import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { expect, it, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { parseNativePdfAnnotationsOnCurrentThread } from './native-import-core'
import { pdfStoredTextRanges } from '../../shared/pdf-annotation-exchange'

it('imports annotations from permission-encrypted PDFs with an empty user password', async () => {
  // Fixture created offline with pypdf RC4-128: empty user password, nonempty owner password.
  // No fixture-generation tools or extra dependencies are needed at test time.
  const fixture = new URL('./fixtures/permission-encrypted.pdf', import.meta.url)
  const data = await readFile(fixture)
  await expect(PDFDocument.load(data)).rejects.toThrow(/encrypted/iu)
  expect((await pdfStoredTextRanges(data)).size).toBe(0)
  const result = await parseNativePdfAnnotationsOnCurrentThread(fileURLToPath(fixture))
  expect(result.annotations).toHaveLength(1)
  expect(result.annotations[0]).toMatchObject({
    pageNumber: 1,
    kind: 'highlight',
    note: 'Readable imported note'
  })
  expect(result.unsupportedCount).toBe(0)
})

it('continues native import when pdf-lib cannot load the encrypted PDF metadata', async () => {
  const fixture = new URL('./fixtures/permission-encrypted.pdf', import.meta.url)
  const load = vi
    .spyOn(PDFDocument, 'load')
    .mockRejectedValueOnce(new Error('Unsupported encrypted object stream'))
  try {
    const result = await parseNativePdfAnnotationsOnCurrentThread(fileURLToPath(fixture))
    expect(load).toHaveBeenCalledWith(expect.any(Uint8Array), {
      updateMetadata: false,
      ignoreEncryption: true
    })
    expect(result.annotations).toHaveLength(1)
    expect(result.annotations[0]).toMatchObject({
      pageNumber: 1,
      kind: 'highlight',
      note: 'Readable imported note'
    })
    expect(result.unsupportedCount).toBe(0)
  } finally {
    load.mockRestore()
  }
})
