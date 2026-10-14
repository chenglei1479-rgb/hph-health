import type {
  ExportVariableDefinitionRequest,
  ExportVariableDefinitionResponse,
  GenerateVariableDefinitionRequest,
  VariableDefinitionTable
} from '../variable-definition'
import { callable, LOCAL } from './definition'

export const contracts = {
  'variableDefinition.generate': callable<
    (request: GenerateVariableDefinitionRequest) => Promise<VariableDefinitionTable>
  >()('variable-definition', ['variable-definition:generate', LOCAL]),
  'variableDefinition.exportTemplate': callable<
    (request: ExportVariableDefinitionRequest) => Promise<ExportVariableDefinitionResponse>
  >()('variable-definition', ['variable-definition:export-template', LOCAL])
} as const
