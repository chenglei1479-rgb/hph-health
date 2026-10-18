import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { strToU8, zipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'

import {
  copyDocxToProject,
  DOCX_ONLY_MESSAGE,
  inspectDocx,
  inspectPhiSafeDocxHeadings
} from './docx-import'

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

  it('keeps heading styles, numbered paragraphs, and table headers while excluding body text', () => {
    const root = mkdtempSync(join(tmpdir(), 'ethics-docx-headings-'))
    const source = join(root, '架空見出し.docx')
    writeFileSync(
      source,
      zipSync({
        '[Content_Types].xml': strToU8('<Types/>'),
        'word/styles.xml': strToU8(
          '<w:styles><w:style w:type="paragraph" w:styleId="1"><w:name w:val="見出し 1"/></w:style></w:styles>'
        ),
        'word/document.xml': strToU8(
          '<w:document><w:body>' +
            '<w:p><w:pPr><w:pStyle w:val="1"/></w:pPr><w:r><w:t>研究の名称</w:t></w:r></w:p>' +
            '<w:p><w:r><w:t>2. 研究の実施体制</w:t></w:r></w:p>' +
            '<w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t>3. これは番号付きだが六十字を超えるため候補にしない非常に長い本文見出しのような文章であり保存してはいけない追加の文章です</w:t></w:r></w:p>' +
            '<w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t>4. これは番号付きの本文です。</w:t></w:r></w:p>' +
            '<w:p><w:r><w:t>これは保存してはいけない通常の本文です。</w:t></w:r></w:p>' +
            '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>研究方法</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>記入欄</w:t></w:r></w:p></w:tc></w:tr>' +
            '<w:tr><w:tc><w:p><w:r><w:t>研究期間</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>患者に関する回答本文</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
            '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>患者ID</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>測定日</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>測定値</w:t></w:r></w:p></w:tc></w:tr>' +
            '<w:tr><w:tc><w:p><w:r><w:t>架空001</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>2026-01-01</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>42</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
            '</w:body></w:document>'
        )
      })
    )

    expect(inspectDocx(source).headings).toEqual([
      '研究の名称',
      '2. 研究の実施体制',
      '研究方法',
      '研究期間'
    ])
  })

  it('drops PHI headings and fails closed when heading detection errors or times out', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ethics-docx-phi-'))
    const source = join(root, '架空PHI確認.docx')
    writeFileSync(
      source,
      zipSync({
        '[Content_Types].xml': strToU8('<Types/>'),
        'word/document.xml': strToU8(
          '<w:document><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:t>研究の名称</w:t></w:p><w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:t>患者 山田太郎</w:t></w:p></w:document>'
        )
      })
    )
    await expect(
      inspectPhiSafeDocxHeadings(source, {
        scan: (text) =>
          text.includes('山田')
            ? [{ start: 3, end: 7, category: 'PERSON_NAME', text: '山田太郎' }]
            : []
      })
    ).resolves.toEqual(['研究の名称'])
    await expect(
      inspectPhiSafeDocxHeadings(source, {
        scan: () => {
          throw new Error('scanner failed')
        }
      })
    ).rejects.toThrow('failed closed')

    vi.useFakeTimers()
    const pending = inspectPhiSafeDocxHeadings(source, {
      scan: () => new Promise(() => undefined),
      timeoutMs: 20
    })
    const assertion = expect(pending).rejects.toThrow('failed closed')
    await vi.advanceTimersByTimeAsync(20)
    await assertion
    vi.useRealTimers()
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
