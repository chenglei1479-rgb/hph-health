import { describe, expect, it, vi } from 'vitest'

import { confirmDeidentifiedExports } from './export-confirm'

describe('export confirmation', () => {
  it('writes clean scripts, reports, and tables without asking', async () => {
    const ask = vi.fn(async () => false)
    await expect(
      confirmDeidentifiedExports(
        [
          { name: 'analysis.py', text: 'print(df.shape)\n' },
          { name: 'report.md', text: '集計のみを記載する。\n' },
          { name: 'table.csv', text: 'group,n\nA,20\n' }
        ],
        ask
      )
    ).resolves.toBe(true)
    expect(ask).not.toHaveBeenCalled()
  })

  it('asks once and stops the export until the doctor confirms', async () => {
    const ask = vi.fn(async () => false)
    const files = [
      { name: 'analysis.py', text: 'karte = "0083341"\n' },
      { name: 'report.md', text: '生年月日: 1980-04-12\n' },
      { name: 'labs.csv', text: 'カルテ番号,CRP\n0083341,3.2\n' }
    ]
    await expect(confirmDeidentifiedExports(files, ask)).resolves.toBe(false)
    expect(ask).toHaveBeenCalledOnce()
    const findings = ask.mock.calls[0]?.[0] ?? []
    expect(findings.map((finding) => finding.fileKind).sort()).toEqual([
      'report',
      'result-table',
      'result-table',
      'script'
    ])
    ask.mockResolvedValueOnce(true)
    await expect(confirmDeidentifiedExports(files, ask)).resolves.toBe(true)
  })
})
