import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { copyDocxToProject, DOCX_ONLY_MESSAGE, inspectDocx } from './docx-import'

const makeDocx = (): Uint8Array =>
  zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'docProps/core.xml': strToU8('<dc:creator>架空 著者</dc:creator>'),
    'word/document.xml': strToU8(
      '<w:document><w:t>架空の本文</w:t><w:ins><w:t>追記</w:t></w:ins><w:del><w:t>削除記録</w:t></w:del><w:txbxContent><w:t>テキストボックス</w:t></w:txbxContent></w:document>'
    ),
    'word/header1.xml': strToU8('<w:hdr><w:t>架空市立さくら病院</w:t></w:hdr>'),
    'word/footer1.xml': strToU8('<w:ftr><w:t>テスト用架空書式</w:t></w:ftr>'),
    'word/footnotes.xml': strToU8('<w:footnotes><w:t>架空の脚注</w:t></w:footnotes>'),
    'word/comments.xml': strToU8('<w:comments><w:t>架空のコメント</w:t></w:comments>'),
    'word/media/image1.png': new Uint8Array([1, 2, 3])
  })

describe('local DOCX import', () => {
  it('extracts all required text surfaces while excluding properties and images', () => {
    const root = mkdtempSync(join(tmpdir(), 'ethics-docx-'))
    const source = join(root, '架空研究計画書.docx')
    writeFileSync(source, makeDocx())
    const inspection = inspectDocx(source)
    expect(inspection.parts.map(({ path }) => path)).toEqual([
      'word/comments.xml',
      'word/document.xml',
      'word/footer1.xml',
      'word/footnotes.xml',
      'word/header1.xml'
    ])
    expect(inspection.parts.some(({ text }) => text.includes('テキストボックス'))).toBe(true)
    expect(JSON.stringify(inspection.parts)).not.toContain('架空 著者')
  })

  it('copies into a project directory without changing the source bytes', () => {
    const root = mkdtempSync(join(tmpdir(), 'ethics-docx-'))
    const source = join(root, 'template.docx')
    writeFileSync(source, makeDocx())
    const before = readFileSync(source)
    const copied = copyDocxToProject(source, join(root, 'project'))
    expect(readFileSync(source)).toEqual(before)
    expect(readFileSync(copied)).toEqual(before)
  })

  it.each(['template.pdf', 'template.doc', 'broken.docx'])(
    'rejects unsupported or damaged input: %s',
    (name) => {
      const path = join(mkdtempSync(join(tmpdir(), 'ethics-docx-')), name)
      writeFileSync(path, 'not a docx')
      expect(() => inspectDocx(path)).toThrow(DOCX_ONLY_MESSAGE)
    }
  )
})
