import type {
  ExportVariableDefinitionRequest,
  ExportVariableDefinitionResponse,
  GenerateVariableDefinitionRequest,
  VariableDefinitionTable
} from '../variable-definition'
import type { ModelRequirementCheck } from '../model-requirement'
import { callable, LOCAL } from './definition'

export const contracts = {
  // #134: asked before the panel renders its form, so the doctor never fills in a plan and only
  // then learns that no model is configured.
  'variableDefinition.getAvailability': callable<() => Promise<ModelRequirementCheck>>()(
    'variable-definition',
    ['variable-definition:availability', LOCAL]
  ),
  'variableDefinition.generate': callable<
    (request: GenerateVariableDefinitionRequest) => Promise<VariableDefinitionTable>
  >()('variable-definition', ['variable-definition:generate', LOCAL]),
  'variableDefinition.exportTemplate': callable<
    (request: ExportVariableDefinitionRequest) => Promise<ExportVariableDefinitionResponse>
  >()('variable-definition', ['variable-definition:export-template', LOCAL])
} as const
