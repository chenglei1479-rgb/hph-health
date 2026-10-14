import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  COLLECTION_SHEET_NAME,
  DEFINITION_SHEET_NAME,
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
    expect(table.variables.map((variable) => variable.name)).toEqual(['術後感染', '年齢'])
    expect(table.variables[0]).toMatchObject({
      recordType: '経過記録',
      coding: '術後感染: あり=1/なし=0',
      type: 'binary'
    })
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
    expect(table.variables[1].definition).toContain('[非公開]')
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
        }
      ]
    })
    expect(exported.filename).toBe('変数定義_収集テンプレート.xlsx')
    const bytes = new Uint8Array(Buffer.from(exported.xlsxBase64, 'base64'))
    const collection = worksheetXml(bytes, COLLECTION_SHEET_NAME)
    expect(collection).toContain('術後感染')
    expect(collection).toContain('年齢')
    expect(collection).toContain('手術日')
    expect(collection).toContain('<row r="1">')
    expect(collection).not.toContain('<row r="2">')
    expect(collection).toContain('sqref="A2:A501"')
    expect(collection).toContain('type="list"')
    expect(collection).toContain('&quot;1,0&quot;')
    expect(collection).toContain('sqref="B2:B501"')
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
