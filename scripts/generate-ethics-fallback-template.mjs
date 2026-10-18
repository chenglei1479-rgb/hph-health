import { readFileSync, writeFileSync } from 'node:fs'
import { strToU8, zipSync } from 'fflate'
const ja = JSON.parse(
  readFileSync(new URL('../src/shared/i18n/locales/ja.json', import.meta.url), 'utf8')
).renderer
const keys = [
  'Research title',
  'Research organization',
  'Purpose and significance',
  'Research methods and period',
  'Participant selection policy',
  'Scientific rationale',
  'Informed consent procedures',
  'Handling of personal information',
  'Burdens, risks, benefits, overall assessment, and minimization measures',
  'Storage and disposal of samples and information',
  'Reports to the head of the research institution',
  'Funding sources and conflicts of interest',
  'Public disclosure of research information',
  'Handling of research results',
  'Consultation system and contact point, including genetic counseling',
  'Proxy consent',
  'Informed assent',
  'Emergency circumstances under Section 8-8',
  'Financial burden or compensation',
  'Response to serious adverse events for invasive research',
  'Compensation for health damage from invasive research',
  'Medical care after the research',
  'Outsourcing',
  'Future research use and provision to other institutions',
  'Monitoring and auditing'
]
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const p = (s) => `<w:p><w:r><w:t>${s}</w:t></w:r></w:p>`
const body = keys.map((key, i) => p(`${i + 1}. ${ja[key]}`) + p('【要記入】')).join('')
const zip = zipSync({
  '[Content_Types].xml': strToU8(
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  ),
  '_rels/.rels': strToU8(
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
  ),
  'word/document.xml': strToU8(
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${p('草案')}${body}</w:body></w:document>`
  )
})
writeFileSync(new URL('../build/ethics-protocol-fallback.docx', import.meta.url), zip)
