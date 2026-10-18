import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import {
  assertSubmissionReady,
  createDraftDocx,
  createFallbackTemplate,
  DRAFT_FOOTER,
  DRAFT_HEADER
} from './docx-export'

describe('ethics DOCX export', () => {
  it('writes draft header, footer, missing list, placeholders and metadata', () => {
    const zip = unzipSync(
      createDraftDocx({ sections: [{ item: 1, text: '【要記入】' }], missingItems: [1] })
    )
    expect(strFromU8(zip['word/header1.xml'])).toContain(DRAFT_HEADER)
    expect(strFromU8(zip['word/footer1.xml'])).toContain(DRAFT_FOOTER)
    expect(strFromU8(zip['word/document.xml'])).toContain('未記入の項目')
    expect(strFromU8(zip['word/document.xml'])).toContain('【要記入】')
    expect(strFromU8(zip['docProps/core.xml'])).toContain('Baselio')
    expect(strFromU8(zip['docProps/custom.xml'])).toContain('r8-beta-0.1')
  })
  it('blocks submission export while any item or placeholder remains', () => {
    expect(() => assertSubmissionReady([{ item: 1, text: '完成' }], [2])).toThrow(
      'submission-export-blocked-incomplete'
    )
    expect(() => assertSubmissionReady([{ item: 1, text: '【要記入】' }], [])).toThrow(
      'submission-export-blocked-incomplete'
    )
  })
  it('creates the fallback in R8 order with all 25 placeholders', () => {
    const document = strFromU8(unzipSync(createFallbackTemplate())['word/document.xml'])
    expect(document.match(/【要記入】/gu) ?? []).toHaveLength(25)
    expect(document.indexOf('1. 研究の名称')).toBeLessThan(
      document.indexOf('25. モニタリング及び監査')
    )
  })
})
