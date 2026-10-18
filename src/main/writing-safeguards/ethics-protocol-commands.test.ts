import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import { createWritingSafeguardsCommandOwner } from './application-commands'
import { createEthicsApprovalStore } from './ethics-store'

vi.mock('../phi/detect', () => ({ detectPhi: () => [] }))

describe('ethics protocol commands', () => {
  it('imports a validated DOCX into project storage and exports a real draft DOCX', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ethics-commands-'))
    const store = createEthicsApprovalStore(join(root, 'state.json'))
    const owner = createWritingSafeguardsCommandOwner(store, join(root, 'protocols'))
    const source = zipSync({
      '[Content_Types].xml': strToU8('<Types/>'),
      'word/document.xml': strToU8('<w:document><w:t>架空の書式</w:t></w:document>')
    })
    expect(
      owner.importEthicsDocx({ projectId: 'study-1', fileName: 'form.docx', bytes: [...source] })
    ).toEqual({
      fileName: 'form.docx',
      headingCandidates: [
        expect.objectContaining({ heading: '架空の書式', item: null, status: '対応不明' })
      ]
    })
    expect(store.getProtocol('study-1').importedDocxPath).toContain('form.docx')
    expect(store.getProtocol('study-1').headingCandidates).toHaveLength(1)
    store.setProtocol('study-1', {
      ...store.getProtocol('study-1'),
      choices: { 18: 'yes', 19: 'no' },
      notApplicableReasons: { 3: 'none' }
    })
    const exported = await owner.exportEthicsDraft({ projectId: 'study-1' })
    expect(exported.fileName).toBe('研究計画書_草案.docx')
    const document = new TextDecoder().decode(
      unzipSync(Uint8Array.from(exported.bytes))['word/document.xml']
    )
    expect(document).toContain('該当なし（none）')
    expect(document).toContain('はい')
    expect(document).toContain('いいえ')
    const missingList = [...document.matchAll(/<w:t[^>]*>(.*?)<\/w:t>/gu)][1]?.[1]
    expect(missingList).not.toMatch(/(?:^|、)3\. /u)
    expect(missingList).not.toMatch(/(?:^|、)18\. /u)
    expect(missingList).not.toMatch(/(?:^|、)19\. /u)
  })
})
