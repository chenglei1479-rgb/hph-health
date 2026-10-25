import { describe, expect, it } from 'vitest'

import { redactPatientRowGateDigest } from './patient-row-gate-redaction'

const line = (scope: string, data: unknown): string =>
  JSON.stringify({ level: 'info', scope, msg: 'm', data })

describe('patient-row gate digest redaction for exports', () => {
  it('removes the digest from a gate record and keeps the other attribution fields', () => {
    const source = line('notebook:patient-row-gate', {
      block: 'non-aggregate-table',
      digest: 'a1b2c3d4e5f6',
      tables: 1,
      tableShapes: [{ rows: 2, columns: 7, statHeaders: 2, groupKeys: 5, describe: false }]
    })

    const redacted = redactPatientRowGateDigest(source)

    expect(redacted).not.toContain('a1b2c3d4e5f6')
    const record = JSON.parse(redacted) as { scope: string; data: Record<string, unknown> }
    expect(record.scope).toBe('notebook:patient-row-gate')
    expect(record.data).toEqual({
      block: 'non-aggregate-table',
      tables: 1,
      tableShapes: [{ rows: 2, columns: 7, statHeaders: 2, groupKeys: 5, describe: false }]
    })
  })

  it('leaves another scope and its digest untouched', () => {
    const source = line('artifacts:repository', { digest: 'deadbeefcafe' })
    expect(redactPatientRowGateDigest(source)).toBe(source)
  })

  it('keeps a record without a digest untouched', () => {
    const source = line('notebook:patient-row-gate', { block: 'record-series' })
    expect(redactPatientRowGateDigest(source)).toBe(source)
  })

  it('preserves a half-written line instead of failing the export', () => {
    const source = `{"level":"info","scope":"notebook:patient-row-gate","msg":"cut`
    expect(redactPatientRowGateDigest(source)).toBe(source)
  })

  it('redacts only the gate line in a multi-line log and keeps line endings', () => {
    const gate = line('notebook:patient-row-gate', { digest: 'a1b2c3d4e5f6' })
    const other = line('acp', { digest: 'keepme123456' })
    const text = `${other}\n${gate}\n`
    const redacted = redactPatientRowGateDigest(text)
    expect(redacted).not.toContain('a1b2c3d4e5f6')
    expect(redacted).toContain('keepme123456')
    expect(redacted.endsWith('\n')).toBe(true)
    expect(redacted.split('\n')).toHaveLength(3)
  })
})
