import { describe, expect, it } from 'vitest'

import { createMemoryPhiVault } from '../phi/store'
import { redactExportText, redactVariableDefinitionRows } from './redact'

const store = () => createMemoryPhiVault().store('probe')

const row = (name: string, definition: string, type = 'text', coding = '') => ({
  name,
  definition,
  type,
  coding
})

const join = (rows: Array<{ name: string; definition: string; type: string; coding: string }>) =>
  rows.map((item) => [item.name, item.definition, item.type, item.coding].join('\t')).join('\n')

describe('variable dictionary redaction', () => {
  it('keeps a short dictionary whose rows merely look like Japanese words', () => {
    // The acceptance finding, in the shape the export actually uses: rows joined with a newline, and
    // short enough overall that detectPhi would otherwise return one span over the whole document.
    const rows = [
      row('readmitted_30d', '合成データの30日再入院フラグ', 'binary', '0=no; 1=yes'),
      row('age', '年齢（歳）', 'integer')
    ]
    const text = join(rows)
    expect(text.length).toBeLessThanOrEqual(80)

    const { text: redacted } = redactVariableDefinitionRows(rows, store())

    expect(redacted).toBe(text)
    expect(redacted).not.toContain('[患者')
  })

  it('keeps a dictionary that is longer than the whole-string window', () => {
    // Most real dictionaries are longer than 80 characters, where the guess never fires. This case
    // documents that the fix does not depend on the flag for the common shape.
    const rows = [
      row('readmitted_30d', '合成データの30日再入院フラグ', 'binary', '0=no; 1=yes'),
      row('sbp', '収縮期血圧（mmHg）', 'integer'),
      row('smoking', '喫煙歴（あり／なし）', 'binary'),
      row(
        'qol',
        '生活の質に関する自記式評価尺度の合計得点であり高いほど良好な状態を示す',
        'integer'
      )
    ]
    const text = join(rows)
    expect(text.length).toBeGreaterThan(80)

    const { text: redacted } = redactVariableDefinitionRows(rows, store())

    expect(redacted).toBe(text)
  })

  it('replaces only the labeled value, never the whole dictionary', () => {
    const rows = [
      row('age', '年齢（歳）', 'integer'),
      row('patient_name', '氏名：山田太郎'),
      row('sbp', '収縮期血圧（mmHg）', 'integer')
    ]

    const { text } = redactVariableDefinitionRows(rows, store())

    // The name is gone, its label and the rest of the row are still there.
    expect(text).not.toContain('山田太郎')
    expect(text).toContain('patient_name\t氏名：[患者')
    expect(text).toContain('\ttext')
    // And the other rows are untouched: a label in one row must not silence the dictionary.
    expect(text).toContain('age\t年齢（歳）\tinteger')
    expect(text).toContain('sbp\t収縮期血圧（mmHg）\tinteger')
  })

  it('keeps the field names even without the structured path', () => {
    // This was the red side of the pair before the detector learned to work per cell: handed the
    // joined document, the guess turned the whole dictionary into one placeholder. It no longer does,
    // so the document path keeps its field names as well; the row path stays the tighter unit.
    const document = join([row('patient_name', '氏名：山田太郎')])

    const { text } = redactExportText(document, store(), 'variable-definition.pdf')

    expect(text).toContain('[患者')
    expect(text).not.toContain('山田太郎')
    expect(text).toContain('patient_name\t氏名：[患者')
  })

  it('still applies the structural detectors inside a row', () => {
    const rows = [row('karte', 'カルテ番号：123456'), row('contact', '連絡先（03-1234-5678）')]

    const { text } = redactVariableDefinitionRows(rows, store())

    expect(text).toContain('[番号')
    expect(text).not.toContain('123456')
    expect(text).not.toContain('03-1234-5678')
    expect(text).toContain('karte\tカルテ番号：')
    expect(text).toContain('contact\t連絡先（')
  })

  it('treats every name label the guessing layer used to accept as a labelled value', () => {
    // With the guess dropped, these labels are the only thing left that can flag a name: a missing
    // one is a silent miss, which is worse than the over-redaction this ticket fixes.
    const labels = ['患者：山田太郎', 'Pt: 山田太郎', 'キーパーソン：山田太郎']

    for (const label of labels) {
      const { text } = redactVariableDefinitionRows([row('patient', label)], store())
      expect(text).not.toContain('山田太郎')
      expect(text).toContain('[患者')
    }
  })

  it('does not read a tab as a label separator', () => {
    // A row whose variable is itself named 氏名 must not redact the definition in the next cell.
    const rows = [row('氏名', '患者データの有無', 'binary', '0=no; 1=yes')]

    const { text } = redactVariableDefinitionRows(rows, store())

    expect(text).toBe('氏名\t患者データの有無\tbinary\t0=no; 1=yes')
  })

  it('points each highlight at its placeholder in the joined document', () => {
    const rows = [
      row('age', '年齢（歳）', 'integer'),
      row('sbp', '収縮期血圧（mmHg）', 'integer'),
      row('patient_name', '氏名：山田太郎')
    ]

    const { text, highlights } = redactVariableDefinitionRows(rows, store())
    const name = highlights.filter((highlight) => highlight.category === 'PERSON_NAME')

    expect(name).toHaveLength(1)
    // Offsets must survive the per-row redaction and the join: the third row starts well past zero.
    expect(text.slice(name[0].start, name[0].end)).toMatch(/^\[患者\d+\]$/)
    expect(name[0].start).toBeGreaterThan(30)
  })

  it('leaves the free-text parts on the original rule', () => {
    // Only the variable dictionary is a table. A report or log line that is just a name stays redacted.
    const report = redactExportText('山田 太郎', store(), 'statistical-report.docx')
    const log = redactExportText('山田 太郎', store(), 'execution-log.pdf')

    expect(report.text).toContain('[患者')
    expect(log.text).toContain('[患者')
  })

  it('masks a heading-shaped line when the whole report is inside the guess window', () => {
    // Accepted over-masking: 統計報告 and a two-kanji surname have the same shape, and the name guess
    // only runs on a text of at most 80 characters. A report long enough to leave that window keeps
    // its title (export.test.ts asserts that shape); a two-line one loses it rather than leak a name.
    const { text } = redactExportText('統計報告\n\n短い。', store(), 'statistical-report.pdf')

    expect(text).toContain('[患者')
    expect(text).not.toContain('統計報告')
  })
})
