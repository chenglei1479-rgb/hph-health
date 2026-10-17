import { writeFileSync } from 'node:fs'
import { strToU8, zipSync } from 'fflate'
import {
  R8_ITEMS,
  R8_RULESET_VERSION,
  type R8ItemNumber
} from '../../shared/ethics-protocol/r8-items'
import ja from '../../shared/i18n/locales/ja.json'

export const DRAFT_HEADER = '草案・未完成'
export const DRAFT_FOOTER =
  'Baselio で作成した草案です。本機関の書式と倫理審査委員会の要求に従って確認してください'

type DraftSection = { item: R8ItemNumber; text: string }
type DraftOptions = { sections: DraftSection[]; missingItems: R8ItemNumber[]; outputPath?: string }
const xml = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const paragraph = (value: string): string =>
  `<w:p><w:r><w:rPr><w:rFonts w:eastAsia="游明朝" w:ascii="MS Mincho"/></w:rPr><w:t xml:space="preserve">${xml(value)}</w:t></w:r></w:p>`
const itemTitle = (number: R8ItemNumber): string =>
  ja.renderer[R8_ITEMS[number - 1].title as keyof typeof ja.renderer] ?? R8_ITEMS[number - 1].title

export const assertSubmissionReady = (
  sections: DraftSection[],
  missingItems: R8ItemNumber[]
): void => {
  if (missingItems.length || sections.some(({ text }) => text.includes('【要記入】')))
    throw new Error('submission-export-blocked-incomplete')
}

export const createDraftDocx = ({
  sections,
  missingItems,
  outputPath
}: DraftOptions): Uint8Array => {
  const list = missingItems.length
    ? missingItems.map((item) => `${item}. ${itemTitle(item)}`).join('、')
    : 'なし'
  const body = [
    paragraph('未記入の項目'),
    paragraph(list),
    ...sections.flatMap(({ item, text }) => [
      paragraph(`${item}. ${itemTitle(item)}`),
      paragraph(text)
    ])
  ].join('')
  const bytes = zipSync({
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/></Types>'
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/></Relationships>'
    ),
    'word/document.xml': strToU8(
      `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}<w:sectPr><w:headerReference w:type="default" r:id="rId1"/><w:footerReference w:type="default" r:id="rId2"/></w:sectPr></w:body></w:document>`
    ),
    'word/_rels/document.xml.rels': strToU8(
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>'
    ),
    'word/header1.xml': strToU8(
      `<?xml version="1.0"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${paragraph(DRAFT_HEADER)}</w:hdr>`
    ),
    'word/footer1.xml': strToU8(
      `<?xml version="1.0"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${paragraph(DRAFT_FOOTER)}</w:ftr>`
    ),
    'docProps/core.xml': strToU8(
      '<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Baselio</dc:creator><dc:title>草案・未完成</dc:title></cp:coreProperties>'
    ),
    'docProps/custom.xml': strToU8(
      `<?xml version="1.0"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="RuleSetVersion"><vt:lpwstr>${R8_RULESET_VERSION}</vt:lpwstr></property><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="3" name="Status"><vt:lpwstr>草案・未完成</vt:lpwstr></property></Properties>`
    )
  })
  if (outputPath) writeFileSync(outputPath, bytes)
  return bytes
}

export const createFallbackTemplate = (outputPath?: string): Uint8Array =>
  createDraftDocx({
    sections: R8_ITEMS.map(({ number }) => ({ item: number, text: '【要記入】' })),
    missingItems: R8_ITEMS.map(({ number }) => number),
    outputPath
  })
