import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { PythonCommand } from '../python-command'
import { createPatientDataTagStore } from './patient-data-tag'
import { redactPatientPhi } from './patient-phi'
import { gateNotebookOutputs, installNotebookModelTextReleaser } from './release-model-text'
import { suppressSmallAggregateText } from './small-cell'
import { createSchemaNotebookService, type SchemaNotebookService } from './service'
import { buildXlsx } from './xlsx-table'

const python: PythonCommand = { command: 'python3', baseArgs: [] }

const csv = [
  'age,sex,note,visit',
  '17,男性,SECRET-9918,1982-04-03',
  '99991,女性,患者氏名：山田太郎,1982-04-03',
  '17,男性,lab-only,1982-04-04',
  '40,男性,follow-up,1982-04-05',
  '41,女性,follow-up,1982-04-06'
].join('\n')

const realCells = [
  '17',
  '99991',
  '男性',
  '女性',
  'SECRET-9918',
  '患者氏名：山田太郎',
  '1982-04-03',
  '1982-04-04',
  'lab-only'
]

const serviceAt = (
  root: string,
  extras: Parameters<typeof createSchemaNotebookService>[0] = {
    directory: root,
    approvalLogPath: join(root, 'missing-approval.jsonl')
  }
): SchemaNotebookService => createSchemaNotebookService(extras)

afterEach(() => {
  installNotebookModelTextReleaser(null)
})

describe('schema-only notebook', () => {
  it('sends synthetic samples that contain no real cell values', async () => {
    const root = mkdtempSync(join(tmpdir(), 'schema-notebook-'))
    const service = serviceAt(root, {
      directory: root,
      approvalLogPath: join(root, 'approved.jsonl'),
      machineApproved: () => true
    })
    const imported = await service.importTable({
      projectId: 'study-1',
      filename: 'patients.csv',
      csvText: csv,
      patientData: true
    })
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    const samples = imported.context.syntheticSampleRows.flat()
    expect(samples.length).toBeGreaterThan(0)
    for (const value of samples) expect(realCells).not.toContain(value)
    const payload = JSON.stringify(imported.context)
    for (const value of ['SECRET-9918', '山田太郎', '男性', '女性', '99991', '1982-04-03']) {
      expect(payload).not.toContain(value)
    }
    expect(imported.context.categoricalValues).toBeUndefined()
    expect(imported.context.columns.map((column) => column.name)).toEqual([
      'age',
      'sex',
      'note',
      'visit'
    ])
    expect(imported.context.rowCount).toBe(5)
    expect(imported.context.mode).toBe('schema-only')
  })

  it('keeps categorical values local until the user opts in, and logs that opt-in', async () => {
    const root = mkdtempSync(join(tmpdir(), 'schema-notebook-opt-'))
    const service = serviceAt(root, {
      directory: root,
      approvalLogPath: join(root, 'approved.jsonl'),
      machineApproved: () => true,
      now: () => new Date('2026-10-14T00:00:00.000Z')
    })
    const imported = await service.importTable({
      projectId: 'study-1',
      filename: 'patients.csv',
      csvText: csv
    })
    if (!imported.ok) throw new Error('import failed')
    expect(imported.context.categoricalValues).toBeUndefined()
    const opted = await service.optInCategorical({
      projectId: 'study-1',
      tableId: imported.context.tableId,
      column: 'sex',
      actor: 'researcher'
    })
    expect(opted.categoricalValues?.sex).toEqual(['男性', '女性'])
    expect(JSON.stringify(opted.syntheticSampleRows)).not.toContain('男性')
    const log = readFileSync(join(root, 'categorical-opt-in.jsonl'), 'utf8')
    expect(log).toContain('"column":"sex"')
    expect(log).toContain('"actor":"researcher"')
    expect(log).toContain('study-1')
  })

  it('marks released patient text as pseudonymized', () => {
    const released = redactPatientPhi('患者氏名：山田太郎')
    expect(released).toBe('患者氏名：[仮名化済み]')
    expect(released).not.toContain('匿名化')
    expect(released).not.toContain('山田太郎')
  })

  it('suppresses aggregate cells with n<10 and gates every model-bound channel', async () => {
    const seen: string[] = []
    installNotebookModelTextReleaser(async (text) => {
      seen.push(text)
      return text.replaceAll('山田太郎', '[非公開]')
    })
    const gated = await gateNotebookOutputs(
      {
        error: 'ValueError: n=2 while reading 山田太郎',
        stdout: 'n=4',
        head: '山田太郎\nage\n72',
        table: 'group,n\nA,4\nB,20'
      },
      'study-1'
    )
    expect(seen).toEqual([
      'ValueError: n=2 while reading 山田太郎',
      'n=4',
      '山田太郎\nage\n72',
      'group,n\nA,4\nB,20'
    ])
    expect(gated.error).toContain('n=<10')
    expect(gated.error).not.toContain('山田太郎')
    expect(gated.stdout).toBe('n=<10')
    expect(gated.head).not.toContain('山田太郎')
    expect(gated.table).toContain('A,<10')
    expect(gated.table).toContain('B,20')
    expect(
      suppressSmallAggregateText('| group | 件数 |\n| --- | --- |\n| A | 3 |\n| B | 15 |')
    ).toContain('| A | <10 |')

    const root = mkdtempSync(join(tmpdir(), 'schema-notebook-run-'))
    seen.length = 0
    const service = serviceAt(root, {
      directory: root,
      approvalLogPath: join(root, 'approved.jsonl'),
      machineApproved: () => true,
      resolvePython: async () => python,
      run: async (_command, scriptPath, cwd) => {
        const localCsv = readFileSync(join(cwd, 'table.csv'), 'utf8')
        expect(localCsv).toContain('SECRET-9918')
        expect(scriptPath.endsWith('analysis.py')).toBe(true)
        return {
          stdout: 'group,n\nA,4\nB,20',
          stderr: 'ValueError: n=2',
          code: 1
        }
      }
    })
    const imported = await service.importTable({
      projectId: 'study-1',
      filename: 'patients.csv',
      csvText: csv
    })
    if (!imported.ok) throw new Error('import failed')
    const executed = await service.execute({
      projectId: 'study-1',
      tableId: imported.context.tableId,
      language: 'python',
      code: 'df.head()\nprint(df)'
    })
    expect(executed.local.stderr).toContain('n=2')
    expect(executed.local.stdout).toContain('A,4')
    expect(executed.local.stdout).not.toContain('<10')
    expect(executed.local.stderr).not.toContain('<10')
    expect(executed.forModel.error).toContain('n=<10')
    expect(executed.forModel.stdout).toContain('A,<10')
    expect(executed.forModel.head).toContain('A,<10')
    expect(executed.forModel.table).toContain('B,20')
    expect(JSON.stringify(executed.forModel)).not.toContain('SECRET-9918')
    expect(seen).toContain('ValueError: n=2')
    expect(seen.filter((text) => text.includes('group,n'))).toHaveLength(3)
  })

  it('tags a project permanently once patient data is imported', async () => {
    const root = mkdtempSync(join(tmpdir(), 'schema-notebook-tag-'))
    const service = serviceAt(root, {
      directory: root,
      approvalLogPath: join(root, 'approved.jsonl'),
      machineApproved: () => true,
      now: () => new Date('2026-10-14T01:00:00.000Z')
    })
    const imported = await service.importTable({
      projectId: 'study-1',
      filename: 'patients.csv',
      csvText: 'group,value\nA,10\nB,12',
      patientData: true
    })
    expect(imported.ok && imported.tagged).toBe(true)
    const tags = createPatientDataTagStore(join(root, 'patient-data-tags.jsonl'))
    expect(tags.has('study-1')).toBe(true)
    expect(() => tags.untag('study-1')).toThrow(/cannot be removed/)
    expect(tags.has('study-1')).toBe(true)
    const clean = await service.importTable({
      projectId: 'study-2',
      filename: 'public.csv',
      csvText: 'group,value\nA,10\nB,12',
      patientData: false
    })
    expect(clean.ok && clean.containsPatientData).toBe(false)
    expect(tags.has('study-2')).toBe(false)
    expect(service.patientDataTags().map((tag) => tag.projectId)).toEqual(['study-1'])
  })

  it('withholds direct-identifier column names and samples after scanning headers and values', async () => {
    const root = mkdtempSync(join(tmpdir(), 'schema-notebook-id-'))
    const service = serviceAt(root, {
      directory: root,
      approvalLogPath: join(root, 'approved.jsonl'),
      machineApproved: () => true
    })
    const imported = await service.importTable({
      projectId: 'study-1',
      filename: 'patients.csv',
      csvText: [
        '研究用ID,カルテ番号,氏名,生年月日,住所,電話番号,マイナンバー,保険者番号,在院日数,連絡先,note',
        'S-1,A12345,山田太郎,1980-01-02,東京都港区,090-1111-2222,123456789012,12345678,12,090-9999-8888,経過は安定'
      ].join('\n'),
      patientData: true
    })
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    expect(imported.context.columns.map((column) => column.name)).toEqual([
      '研究用ID',
      '在院日数',
      'note'
    ])
    expect(imported.context.syntheticSampleRows.every((row) => row.length === 3)).toBe(true)
    const payload = JSON.stringify(imported.context)
    for (const hidden of [
      'カルテ番号',
      '氏名',
      '生年月日',
      '住所',
      '電話番号',
      'マイナンバー',
      '保険者番号',
      '連絡先',
      '山田太郎',
      'A12345',
      '090-1111-2222'
    ]) {
      expect(payload).not.toContain(hidden)
    }
    expect(imported.identifierWarnings.map((warning) => warning.column)).toEqual([
      'カルテ番号',
      '氏名',
      '生年月日',
      '住所',
      '電話番号',
      'マイナンバー',
      '保険者番号',
      '連絡先'
    ])
    expect(
      imported.identifierWarnings.every(
        (warning) =>
          warning.message ===
          'この列は AI には送信されません。院外にデータを渡す前に、この列を削除してください。'
      )
    ).toBe(true)
    await expect(
      service.optInCategorical({
        projectId: 'study-1',
        tableId: imported.context.tableId,
        column: '氏名'
      })
    ).rejects.toThrow(/not sent to the model/)
  })

  it('blocks PHI import on a machine that is not hospital-approved and reports spans', async () => {
    const root = mkdtempSync(join(tmpdir(), 'schema-notebook-block-'))
    writeFileSync(
      join(root, 'machine-approval.jsonl'),
      `${JSON.stringify({ at: '2026-10-14T00:00:00.000Z', approved: false, approvalNumber: null })}\n`
    )
    const service = serviceAt(root, {
      directory: root,
      approvalLogPath: join(root, 'machine-approval.jsonl')
    })
    const blocked = await service.importTable({
      projectId: 'study-1',
      filename: 'patients.csv',
      csvText: 'note,mail\n患者氏名：山田太郎,a@example.jp\nカルテ番号：A1234,none'
    })
    expect(blocked.ok).toBe(false)
    if (blocked.ok) return
    expect(blocked.blocked).toBe(true)
    expect(blocked.message).toContain('病院の承認')
    expect(blocked.spans.map((span) => span.category).sort()).toEqual([
      'EMAIL',
      'KARTE_NO',
      'PERSON_NAME'
    ])
    expect(blocked.spans.find((span) => span.category === 'PERSON_NAME')?.reason).toContain(
      '山田太郎'
    )
    expect(createPatientDataTagStore(join(root, 'patient-data-tags.jsonl')).has('study-1')).toBe(
      false
    )

    writeFileSync(
      join(root, 'machine-approval.jsonl'),
      `${JSON.stringify({ at: '2026-10-14T00:00:00.000Z', approved: false, approvalNumber: null })}\n` +
        `${JSON.stringify({ at: '2026-10-14T01:00:00.000Z', approved: true, approvalNumber: 'H-14' })}\n`
    )
    const workbook = Buffer.from(
      buildXlsx([
        {
          name: '収集',
          rows: [
            ['age', 'note'],
            ['40', 'none']
          ]
        }
      ])
    ).toString('base64')
    const allowed = await service.importTable({
      projectId: 'study-1',
      filename: 'patients.xlsx',
      xlsxBase64: workbook,
      patientData: true
    })
    expect(allowed.ok).toBe(true)
    if (!allowed.ok) return
    expect(allowed.context.columns.map((column) => column.name)).toEqual(['age', 'note'])
    expect(allowed.tagged).toBe(true)
  })
})
