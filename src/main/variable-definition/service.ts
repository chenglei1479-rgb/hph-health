import type {
  ExportVariableDefinitionResponse,
  GenerateVariableDefinitionRequest,
  VariableDefinitionTable
} from '../../shared/variable-definition'
import type { ModelRequirementCheck } from '../../shared/model-requirement'
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
  // The pre-flight answer for the panel (#134). It reads configuration only.
  availability: () => Promise<ModelRequirementCheck>
  generate: (request: GenerateVariableDefinitionRequest) => Promise<VariableDefinitionTable>
  exportTemplate: (table: VariableDefinitionTable) => ExportVariableDefinitionResponse
}

export const createVariableDefinitionService = (options: {
  complete: VariableDefinitionCompleter
  availability?: () => Promise<ModelRequirementCheck>
}): VariableDefinitionService => ({
  // A service created without a probe cannot claim readiness; "unreadable" is the honest answer and
  // tells the panel to offer a retry rather than a settings detour.
  availability:
    options.availability ??
    (async (): Promise<ModelRequirementCheck> => ({
      status: 'unavailable',
      code: 'model-requirement-settings-unreadable'
    })),
  async generate(request) {
    const projectId = requireText(request.projectId, 'projectId is required.')
    const researchPlan = requireText(request.researchPlan, '研究計画を入力してください。')
    const releasedPrompt = await releaseVariableDefinitionText(
      buildVariableDefinitionPrompt(researchPlan),
      projectId
    )
    const raw = await options.complete(releasedPrompt)
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
