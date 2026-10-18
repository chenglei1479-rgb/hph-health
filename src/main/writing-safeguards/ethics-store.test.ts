import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { createEthicsApprovalStore } from './ethics-store'

describe('ethics approval store', () => {
  it('keeps one approval number per project', () => {
    const root = mkdtempSync(join(tmpdir(), 'ethics-approval-'))
    const store = createEthicsApprovalStore(
      join(root, 'ethics-approval.json'),
      () => new Date('2026-04-01T00:00:00.000Z')
    )
    expect(store.get('study-1')).toBe('')
    expect(store.set('study-1', ' 2024-医-018 ')).toBe('2024-医-018')
    expect(store.get('study-1')).toBe('2024-医-018')
    expect(store.get('study-2')).toBe('')
    store.set('study-1', '')
    expect(store.get('study-1')).toBe('')
    const raw = readFileSync(join(root, 'ethics-approval.json'), 'utf8')
    expect(raw).toContain('study-1')
    expect(raw).toContain('2026-04-01')
  })

  it('persists checklist answers and doctor-confirmed heading mappings by project', () => {
    const root = mkdtempSync(join(tmpdir(), 'ethics-protocol-'))
    const path = join(root, 'ethics-approval.json')
    const store = createEthicsApprovalStore(path)
    expect(store.getProtocol('study-1')).toEqual({
      choices: {},
      sectionTexts: {},
      notApplicableReasons: {},
      confirmedMappings: []
    })
    const protocol = {
      choices: { 23: 'unknown' as const },
      notApplicableReasons: { 19: '謝礼を設定しないため' },
      confirmedMappings: [
        {
          heading: '研究方法',
          item: 4 as const,
          confirmedBy: 'doctor-1',
          confirmedAt: '2026-10-17T12:00:00+09:00'
        }
      ]
    }
    store.setProtocol('study-1', protocol)
    expect(createEthicsApprovalStore(path).getProtocol('study-1')).toEqual(protocol)
  })

  it('preserves the complete protocol and approval number regardless of save order', () => {
    const root = mkdtempSync(join(tmpdir(), 'ethics-store-order-'))
    const path = join(root, 'ethics-approval.json')
    const store = createEthicsApprovalStore(path)
    const protocol = {
      choices: { 18: 'yes' as const },
      sectionTexts: { 1: '架空研究' },
      notApplicableReasons: { 16: '成人のみを対象とするため' },
      confirmedMappings: [
        {
          heading: '研究の名称',
          item: 1 as const,
          confirmedBy: 'doctor-1',
          confirmedAt: '2026-10-18T09:00:00+09:00'
        }
      ],
      headingCandidates: [
        { heading: '研究の名称', item: 1 as const, confidence: 1, status: '候補' as const }
      ]
    }

    store.setProtocol('protocol-first', protocol)
    store.set('protocol-first', '2026-架空-001')
    expect(store.getProtocol('protocol-first')).toEqual(protocol)

    store.set('approval-first', '2026-架空-002')
    store.setProtocol('approval-first', protocol)
    expect(store.get('approval-first')).toBe('2026-架空-002')
    expect(store.getProtocol('approval-first')).toEqual(protocol)
  })
})
