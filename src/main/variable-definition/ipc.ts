import { ipcMainHandle } from '../ipc-handler-registry'
import type {
  ExportVariableDefinitionRequest,
  GenerateVariableDefinitionRequest
} from '../../shared/variable-definition'
import { defaultVariableDefinitionCompleter } from './model-client'
import { createVariableDefinitionService, type VariableDefinitionService } from './service'

export const registerVariableDefinitionIpc = (
  service: VariableDefinitionService = createVariableDefinitionService({
    complete: defaultVariableDefinitionCompleter()
  })
): void => {
  ipcMainHandle(
    'variable-definition:generate',
    (_event, request: GenerateVariableDefinitionRequest) => service.generate(request)
  )
  ipcMainHandle(
    'variable-definition:export-template',
    (_event, request: ExportVariableDefinitionRequest) => service.exportTemplate(request.table)
  )
}
