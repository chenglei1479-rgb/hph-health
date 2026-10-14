import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  COLLECTION_SHEET_NAME,
  COLLECTION_TEMPLATE_NOTES,
  DEFINITION_SHEET_NAME,
  NOTES_SHEET_NAME,
  RESEARCH_ID_COLUMN_NAME,
  VARIABLE_DEFINITION_TEMPLATE_OPTION
} from '../../shared/variable-definition'
import { createOpenAiVariableDefinitionCompleter } from './model-client'
import { installVariableDefinitionTextReleaser } from './release-model-text'
import { createVariableDefinitionService } from './service'
import { worksheetXml } from './xlsx-template'

const modelReply = JSON.stringify([
  {
    name: '術後感染',
    definition: '手術後30日以内の手術部位感染',
    recordType: '経過記録',
    coding: '術後感染: あり=1/なし=0',
    type: 'binary',
    allowedRange: '0-1'
  },
  {
    name: '年齢',
    definition: '入院時の年齢',
    recordType: '退院サマリー',
    coding: '',
    type: 'integer',
    allowedRange: '0-120'
  }
])

afterEach(() => {
  installVariableDefinitionTextReleaser(null)
})

describe('variable definition template', () => {
  it('sends the research plan to the model only after the PHI release hook', async () => {
    const seen: string[] = []
    const service = createVariableDefinitionService({
      complete: async (prompt) => {
        seen.push(prompt)
        return modelReply
      }
    })
    const table = await service.generate({
      projectId: 'study-1',
      researchPlan: '術後感染の有無を退院サマリーで判定する。患者氏名：山田太郎。年齢は0から120。'
    })
    expect(seen).toHaveLength(1)
    expect(seen[0]).not.toContain('山田太郎')
    expect(seen[0]).toContain('[非公開]')
    expect(seen[0]).toContain('退院サマリー')
    expect(table.variables.map((variable) => variable.name)).toEqual([
      RESEARCH_ID_COLUMN_NAME,
      '術後感染',
      '年齢'
    ])
    expect(table.variables[1]).toMatchObject({
      recordType: '経過記録',
      coding: '術後感染: あり=1/なし=0',
      type: 'binary'
    })
    expect(seen[0]).toContain('在院日数')
    expect(table.warnings).toEqual([])
  })

  it('redacts identifiers the model echoes before they can enter the template', async () => {
    const service = createVariableDefinitionService({
      complete: async () => modelReply.replace('入院時の年齢', '入院時の年齢。患者氏名：山田太郎')
    })
    const table = await service.generate({
      projectId: 'study-1',
      researchPlan: '術後感染と年齢を収集する。'
    })
    expect(JSON.stringify(table)).not.toContain('山田太郎')
    expect(table.variables.find((variable) => variable.name === '年齢')?.definition).toContain(
      '[非公開]'
    )
  })

  it('drops direct-identifier columns, warns, and flags a raw date without dropping day counts', async () => {
    const service = createVariableDefinitionService({
      complete: async () =>
        JSON.stringify([
          {
            name: '患者氏名',
            definition: '姓名',
            recordType: 'カルテ',
            coding: '',
            type: 'text',
            allowedRange: ''
          },
          {
            name: 'カルテ番号',
            definition: '診療録番号',
            recordType: 'カルテ',
            coding: '',
            type: 'text',
            allowedRange: ''
          },
          {
            name: '生年月日',
            definition: '生まれた日',
            recordType: 'カルテ',
            coding: '',
            type: 'date',
            allowedRange: ''
          },
          {
            name: '住所',
            definition: '自宅',
            recordType: 'カルテ',
            coding: '',
            type: 'text',
            allowedRange: ''
          },
          {
            name: '電話番号',
            definition: '連絡先',
            recordType: 'カルテ',
            coding: '',
            type: 'text',
            allowedRange: ''
          },
          {
            name: 'マイナンバー',
            definition: '個人番号',
            recordType: 'カルテ',
            coding: '',
            type: 'text',
            allowedRange: ''
          },
          {
            name: '保険者番号',
            definition: '保険',
            recordType: 'カルテ',
            coding: '',
            type: 'text',
            allowedRange: ''
          },
          {
            name: '手術日',
            definition: '手術を行った暦日',
            recordType: '経過記録',
            coding: '',
            type: 'date',
            allowedRange: ''
          },
          {
            name: '在院日数',
            definition: '入院日から退院日までの日数',
            recordType: '退院サマリー',
            coding: '',
            type: 'integer',
            allowedRange: '0-365'
          },
          {
            name: '退院〜再入院日数',
            definition: '退院から再入院までの日数',
            recordType: '経過記録',
            coding: '',
            type: 'integer',
            allowedRange: '0-365'
          }
        ])
    })
    const table = await service.generate({
      projectId: 'study-1',
      researchPlan: '術後感染の有無と在院日数を調べる。'
    })
    expect(table.variables.map((variable) => variable.name)).toEqual([
      RESEARCH_ID_COLUMN_NAME,
      '手術日',
      '在院日数',
      '退院〜再入院日数'
    ])
    const dropped = table.warnings.filter((warning) => warning.code === 'dropped-identifier')
    expect(dropped.map((warning) => warning.name)).toEqual([
      '患者氏名',
      'カルテ番号',
      '生年月日',
      '住所',
      '電話番号',
      'マイナンバー',
      '保険者番号'
    ])
    expect(dropped.every((warning) => warning.message.includes('除きました'))).toBe(true)
    expect(
      table.warnings.filter((warning) => warning.code === 'raw-date').map((warning) => warning.name)
    ).toEqual(['手術日'])
    expect(table.warnings.some((warning) => warning.name === '在院日数')).toBe(false)
    expect(table.warnings.some((warning) => warning.name === '退院〜再入院日数')).toBe(false)
  })

  it('exports a collection workbook whose header matches Notebook import and validates cells', () => {
    const service = createVariableDefinitionService({
      complete: async () => modelReply
    })
    const exported = service.exportTemplate({
      projectId: 'study-1',
      variables: [
        {
          name: '術後感染',
          definition: '手術後30日以内の手術部位感染',
          recordType: '経過記録',
          coding: 'あり=1/なし=0',
          type: 'binary',
          allowedRange: '0-1'
        },
        {
          name: '年齢',
          definition: '入院時の年齢',
          recordType: '退院サマリー',
          coding: '',
          type: 'integer',
          allowedRange: '0-120'
        },
        {
          name: '手術日',
          definition: '手術を行った日',
          recordType: '経過記録',
          coding: '',
          type: 'date',
          allowedRange: ''
        },
        {
          name: 'カルテ番号',
          definition: '診療録番号',
          recordType: 'カルテ',
          coding: '',
          type: 'text',
          allowedRange: ''
        }
      ],
      warnings: []
    })
    expect(exported.filename).toBe('変数定義_収集テンプレート.xlsx')
    const bytes = new Uint8Array(Buffer.from(exported.xlsxBase64, 'base64'))
    const collection = worksheetXml(bytes, COLLECTION_SHEET_NAME)
    expect(collection).toContain('術後感染')
    expect(collection).toContain('年齢')
    expect(collection).toContain('手術日')
    expect(collection).toContain(
      `<c r="A1" t="inlineStr"><is><t>${RESEARCH_ID_COLUMN_NAME}</t></is></c>`
    )
    expect(collection).not.toContain('カルテ番号')
    expect(collection).toContain('<row r="1">')
    expect(collection).not.toContain('<row r="2">')
    expect(collection).toContain('sqref="B2:B501"')
    expect(collection).toContain('type="list"')
    expect(collection).toContain('&quot;1,0&quot;')
    expect(collection).toContain('sqref="C2:C501"')
    expect(collection).toContain('type="whole"')
    expect(collection).toContain('<formula1>0</formula1>')
    expect(collection).toContain('<formula2>120</formula2>')
    expect(collection).toContain('type="date"')
    const definitions = worksheetXml(bytes, DEFINITION_SHEET_NAME)
    expect(definitions).toContain('変数名')
    expect(definitions).toContain('判断する記録')
    expect(definitions).toContain('コーディング')
    expect(definitions).toContain('許容範囲')
    expect(definitions).toContain('経過記録')
    expect(definitions).toContain('退院サマリー')
    expect(definitions).toContain('二値')
    const notes = worksheetXml(bytes, NOTES_SHEET_NAME)
    for (const note of COLLECTION_TEMPLATE_NOTES) expect(notes).toContain(note)
    expect(notes).toContain('病院が指定した場所')
    expect(notes).toContain('匿名データとして院外に持ち出してはいけません')
  })

  it('keeps the deliverable-package option separate until that flow is merged', () => {
    expect(VARIABLE_DEFINITION_TEMPLATE_OPTION.id).toBe('variable-definition-template')
    expect(VARIABLE_DEFINITION_TEMPLATE_OPTION.integratesWith).toBe(
      'src/renderer/src/pages/home/deliverable-packages.ts'
    )
    expect(VARIABLE_DEFINITION_TEMPLATE_OPTION.deliverablePackageIdsAfterMerge).toContain(
      'writing-pack'
    )
  })

  it('posts only the completed prompt to an OpenAI-compatible model', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        messages: Array<{ content: string }>
      }
      expect(body.messages[0].content).toBe('released plan')
      expect(body.messages[0].content).not.toContain('山田太郎')
      return new Response(JSON.stringify({ choices: [{ message: { content: modelReply } }] }), {
        status: 200
      })
    })
    const complete = createOpenAiVariableDefinitionCompleter({
      baseUrl: 'http://127.0.0.1:9/v1',
      model: 'local',
      fetchImpl: fetchImpl as unknown as typeof fetch
    })
    await expect(complete('released plan')).resolves.toContain('術後感染')
    expect(fetchImpl).toHaveBeenCalledOnce()
  })
})
