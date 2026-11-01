import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { pdfTranslationResourceDirectory } from '@aipoch/pdf-translation/resources'
import { describe, expect, it } from 'vitest'

import { buildPdf } from './files'

type PdfiumText = { FPDF_GetPageCount: (doc: number) => number }

// Read the text back the way a reader does: through the embedded ToUnicode CMap, not from the bytes we
// wrote. A wrong glyph id shows up here as a wrong character, which is exactly what users saw.
const readBack = async (bytes: Uint8Array): Promise<string> => {
  const { engine } = await import(
    pathToFileURL(join(pdfTranslationResourceDirectory(), 'pdfium.mjs')).href
  )
  const native = await engine()
  const document = native.open(bytes)
  const p = native.p as PdfiumText & Record<string, (...args: number[]) => number>
  try {
    let text = ''
    const pages = p.FPDF_GetPageCount(document.doc)
    for (let index = 0; index < pages; index += 1) {
      const page = p.FPDF_LoadPage(document.doc, index)
      const pageText = p.FPDFText_LoadPage(page)
      try {
        const count = p.FPDFText_CountChars(pageText)
        for (let character = 0; character < count; character += 1) {
          const code = p.FPDFText_GetUnicode(pageText, character)
          // 2 is the text layer's line-break marker.
          text += code === 2 ? '\n' : String.fromCodePoint(code)
        }
      } finally {
        p.FPDFText_ClosePage(pageText)
        p.FPDF_ClosePage(page)
      }
    }
    return text
  } finally {
    document.close()
  }
}

const flat = (value: string): string => value.replace(/\s+/gu, '')

// The shape that broke: every number sits behind letters or punctuation inside one line.
const STATISTICS = 'n=240; events=40; rate=16.7%; CI=12.5-21.9%'
// A line that starts with digits stayed correct before the fix — useful as a control, not as proof.
const LEADING_DIGITS = '240 症例'
// Proves the subset keeps CJK, which is what the report body actually contains.
const JAPANESE = '変数定義 患者数 240 例、年齢（歳）の中央値は 62 歳、読み仮名テスト：年齢（歳）。'

describe('statistician PDF report', () => {
  it('reads every digit back unchanged when the number follows other text', async () => {
    const pdf = await buildPdf('統計結果', STATISTICS)

    const text = await readBack(pdf)

    // The pre-fix build wrote glyph ids 30559+d here, so the numbers read back as 睡督睟-style
    // characters: every digit was offset by exactly that constant.
    expect(flat(text)).toContain(flat(STATISTICS))
    expect(flat(text)).not.toMatch(/[\u775f-\u7770]/u)
  })

  it('keeps a line that begins with digits correct', async () => {
    // This was already right before the fix. It stays here as a control: a build that breaks it is
    // broken in a new way, and a build that passes only this case is not fixed.
    const pdf = await buildPdf('統計結果', LEADING_DIGITS)

    expect(flat(await readBack(pdf))).toContain(flat(LEADING_DIGITS))
  })

  it('keeps Japanese prose intact through the subsetted font', async () => {
    const pdf = await buildPdf('統計結果', JAPANESE)

    const text = flat(await readBack(pdf))
    // Long runs of kanji and kana must survive subsetting; a subset that dropped them would show up
    // as missing characters rather than wrong ids.
    expect(text).toContain(flat(JAPANESE))
  })

  it('keeps the whole report far below one page of embedded font data', async () => {
    const body = [STATISTICS, LEADING_DIGITS, JAPANESE].join('\n')
    const pdf = await buildPdf('統計結果', body)

    // Before the fix this was ~7.3 MB per page: the full Noto Sans SC face went in on every page.
    expect(pdf.byteLength).toBeLessThan(1_000_000)
  })
})
