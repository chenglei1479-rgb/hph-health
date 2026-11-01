import { describe, expect, it } from 'vitest'

import { createMemoryPhiVault } from '../phi/store'
import { redactExportText } from './redact'

const store = () => createMemoryPhiVault().store('probe')

describe('variable dictionary redaction', () => {
  it('keeps a governed variable row that merely looks like a Japanese name', () => {
    // Reported in acceptance: week-3 of the beta, this whole row became `[患者1]` and the exported
    // variable-definition.pdf lost the variable name, definition, type and coding.
    const row = 'readmitted_30d\t合成データの30日再入院フラグ\tbinary\t0=no; 1=yes'

    const { text } = redactExportText(row, store(), 'variable-definition.pdf', { structured: true })

    expect(text).toBe(row)
    expect(text).not.toContain('[患者')
  })

  it('keeps label-only cells of the reviewed decoy shapes', () => {
    // Each row is asserted on its own: joined into one multi-line document they would escape the
    // whole-string guess for the wrong reason (a long text is never a single name).
    const rows = [
      'age\t年齢（歳）\tinteger\t',
      'sex\t性別（男性／女性）\tbinary\t1=男性; 2=女性',
      'sbp\t収縮期血圧（mmHg）\tinteger\t',
      'facility\t施設名\ttext\t',
      'ward\t病棟\ttext\t'
    ]

    for (const row of rows) {
      const { text } = redactExportText(row, store(), 'variable-definition.pdf', {
        structured: true
      })
      expect(text).toBe(row)
    }
  })

  it('still redacts a cell that carries its own name label', () => {
    const row = 'patient_name\t氏名：山田太郎\ttext\t'

    const { text } = redactExportText(row, store(), 'variable-definition.pdf', { structured: true })

    expect(text).toContain('[患者')
    expect(text).not.toContain('山田太郎')
  })

  it('still applies the structural detectors in a table cell', () => {
    const row = 'karte_no\tカルテ番号：A1234\ttext\t'

    const { text } = redactExportText(row, store(), 'variable-definition.pdf', { structured: true })

    expect(text).toContain('[番号')
    expect(text).not.toContain('A1234')
  })

  it('leaves the free-text parts on the original rule', () => {
    // Only the variable dictionary is a table. A report or a log line that is just a name stays
    // redacted, so this flag cannot be reused to weaken the other export parts.
    const report = redactExportText('山田 太郎', store(), 'statistical-report.docx')
    const log = redactExportText('山田 太郎', store(), 'execution-log.pdf')

    expect(report.text).toContain('[患者')
    expect(log.text).toContain('[患者')
  })
})
