import { ipcMainHandle } from '../../ipc-handler-registry'
import type {
  CategoricalOptInRequest,
  ExecuteAnalysisRequest,
  ImportTableRequest
} from '../../../shared/schema-notebook'
import { createSchemaNotebookService, type SchemaNotebookService } from './service'

export const registerSchemaNotebookIpc = (
  options: {
    directory: string
    approvalLogPath: string
  },
  service: SchemaNotebookService = createSchemaNotebookService(options)
): SchemaNotebookService => {
  ipcMainHandle('schema-notebook:import-table', (_event, request: ImportTableRequest) =>
    service.importTable(request)
  )
  ipcMainHandle('schema-notebook:opt-in-categorical', (_event, request: CategoricalOptInRequest) =>
    service.optInCategorical(request)
  )
  ipcMainHandle(
    'schema-notebook:model-context',
    (_event, request: { projectId: string; tableId: string }) =>
      service.modelContext(request.projectId, request.tableId)
  )
  ipcMainHandle('schema-notebook:execute', (_event, request: ExecuteAnalysisRequest) =>
    service.execute(request)
  )
  ipcMainHandle('schema-notebook:patient-data-tags', () => service.patientDataTags())
  return service
}
