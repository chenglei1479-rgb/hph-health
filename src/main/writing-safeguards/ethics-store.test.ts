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
})
