import { describe, expect, it } from 'vitest'

import { inspectExportFile, releaseExport, releaseExportSet } from './export-deidentify'

describe('export de-identification', () => {
  it('detects a hardcoded karte number in a script', () => {
    const findings = inspectExportFile({
      name: 'analysis.py',
      text: 'karte_no = "0083341"\nprint(df.shape)\n'
    })
    expect(findings.map((finding) => finding.kind)).toContain('karte-number')
    expect(findings[0]?.fileKind).toBe('script')
    expect(findings[0]?.label).toBe('カルテ番号')
  })

  it('detects a birth date in a report', () => {
    const findings = inspectExportFile({
      name: 'case-report.md',
      text: '生年月日: 1980-04-12\n\n考察を述べる。\n'
    })
    expect(findings.map((finding) => finding.kind)).toEqual(['birth-date'])
    expect(findings[0]?.fileKind).toBe('report')
  })

  it('detects an individual patient value in a result table', () => {
    const findings = inspectExportFile({
      name: 'labs.csv',
      text: 'カルテ番号,HbA1c\n0083341,7.2\n'
    })
    expect(findings.map((finding) => finding.kind)).toEqual(
      expect.arrayContaining(['karte-number', 'individual-patient-value'])
    )
    expect(findings.every((finding) => finding.fileKind === 'result-table')).toBe(true)
  })

  it('leaves aggregate tables and study periods alone', () => {
    expect(
      inspectExportFile({
        name: 'table.csv',
        text: 'group,n,mean\nA,20,7.2\nB,18,6.8\n'
      })
    ).toEqual([])
    expect(
      inspectExportFile({
        name: 'methods.md',
        text: '研究期間：2020-01-01 から 2022-12-31。p=0.03。\n'
      })
    ).toEqual([])
  })

  it('requires confirmation before a finding can be exported', () => {
    const script = { name: 'plot.R', text: 'MRN = "A-10293"\n' }
    const blocked = releaseExport(script)
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.findings[0]?.kind).toBe('karte-number')
    expect(releaseExport({ ...script, confirmed: true }).ok).toBe(true)
    expect(releaseExport({ name: 'clean.py', text: 'print(1)\n' }).ok).toBe(true)
  })

  it('checks scripts, reports, and result tables together', () => {
    const release = releaseExportSet([
      { name: 'run.py', text: 'print("hello")\n' },
      { name: 'report.md', text: 'DOB: 1972-11-03\n' },
      { name: 'counts.tsv', text: '群\t人数\n全体\t40\n' }
    ])
    expect(release.ok).toBe(false)
    if (!release.ok) expect(release.findings.map((finding) => finding.fileKind)).toEqual(['report'])
  })
})
