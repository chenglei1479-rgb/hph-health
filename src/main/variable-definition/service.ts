import type {
  ExportVariableDefinitionResponse,
  GenerateVariableDefinitionRequest,
  VariableDefinitionTable
} from '../../shared/variable-definition'
import type { VariableDefinitionCompleter } from './model-client'
import { buildVariableDefinitionPrompt } from './prompt'
import { parseVariableDefinitions } from './parse'
import { prepareVariableDefinitions } from './prepare-columns'
import { releaseVariableDefinitionText } from './release-model-text'
import { buildCollectionTemplate } from './xlsx-template'

const requireText = (value: string, message: string): string => {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(message)
  return trimmed
}

export type VariableDefinitionService = {
  generate: (request: GenerateVariableDefinitionRequest) => Promise<VariableDefinitionTable>
  exportTemplate: (table: VariableDefinitionTable) => ExportVariableDefinitionResponse
}

export const createVariableDefinitionService = (options: {
  complete: VariableDefinitionCompleter
}): VariableDefinitionService => ({
  async generate(request) {
    const projectId = requireText(request.projectId, 'projectId is required.')
    const researchPlan = requireText(request.researchPlan, '研究計画を入力してください。')
    const releasedPlan = await releaseVariableDefinitionText(researchPlan, projectId)
    const raw = await options.complete(buildVariableDefinitionPrompt(releasedPlan))
    const releasedReply = await releaseVariableDefinitionText(raw, projectId)
    const prepared = prepareVariableDefinitions(parseVariableDefinitions(releasedReply))
    return { projectId, ...prepared }
  },
  exportTemplate(table) {
    requireText(table.projectId, 'projectId is required.')
    const bytes = buildCollectionTemplate(table.variables)
    return {
      filename: '変数定義_収集テンプレート.xlsx',
      xlsxBase64: Buffer.from(bytes).toString('base64')
    }
  }
})
