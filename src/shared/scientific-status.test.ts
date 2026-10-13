import { describe, expect, it } from 'vitest'
import {
  newScientificItem,
  readScientificRecord,
  saveScientificRecord,
  scientificItemSchema,
  scientificRecordSchema,
  scientificStatusKey
} from './scientific-status'

describe('scientific status evidence boundaries', () => {
  it('does not mark prepared content as computed without explicitly checked outputs', () => {
    const draft = { ...newScientificItem('a', 'Cox'), status: 'computed' as const }
    expect(scientificItemSchema.safeParse(draft).success).toBe(false)
    expect(scientificItemSchema.safeParse({ ...draft, evidence: 'draft.R' }).success).toBe(false)
    expect(scientificItemSchema.safeParse({ ...draft, outputsChecked: true }).success).toBe(false)
    expect(
      scientificItemSchema.safeParse({
        ...draft,
        evidence: 'Run r1 / result.csv / input v1',
        outputsChecked: true
      }).success
    ).toBe(true)
  })
  it('requires a reviewable material or an explicit missing data condition', () => {
    const item = newScientificItem('a', 'PFS')
    expect(scientificItemSchema.safeParse({ ...item, status: 'needs-review' }).success).toBe(false)
    expect(
      scientificItemSchema.safeParse({ ...item, status: 'needs-review', evidence: 'plan.md' })
        .success
    ).toBe(true)
    expect(
      scientificItemSchema.safeParse({ ...item, status: 'data-blocked', dataCondition: '  ' })
        .success
    ).toBe(false)
    expect(
      scientificItemSchema.safeParse({
        ...item,
        status: 'data-blocked',
        dataCondition: 'No censoring definition'
      }).success
    ).toBe(true)
  })
  it('reloads only the selected project and rejects mismatched project identity', () => {
    const map = new Map<string, string>()
    const storage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value)
      }
    }
    const record = {
      version: 1 as const,
      projectId: 'a',
      items: [newScientificItem('x', 'Audit')],
      updatedAt: 1
    }
    saveScientificRecord(storage, record)
    expect(readScientificRecord(storage, 'a')).toEqual(record)
    expect(readScientificRecord(storage, 'b')).toBeUndefined()
    map.set(scientificStatusKey('b'), JSON.stringify(record))
    expect(() => readScientificRecord(storage, 'b')).toThrow('another project')
  })
  it('does not repair corrupt data or swallow persistence failure', () => {
    expect(() => readScientificRecord({ getItem: () => '{bad' }, 'a')).toThrow()
    expect(() =>
      saveScientificRecord(
        {
          setItem: () => {
            throw new Error('quota')
          }
        },
        { version: 1, projectId: 'a', items: [], updatedAt: 1 }
      )
    ).toThrow('quota')
    expect(
      scientificRecordSchema.safeParse({
        version: 1,
        projectId: 'a',
        items: [newScientificItem('x', 'A'), newScientificItem('x', 'B')],
        updatedAt: 1
      }).success
    ).toBe(false)
  })
})
