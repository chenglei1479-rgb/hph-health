import { ipcMainHandle } from '../../ipc-handler-registry'
import { ApplicationCommandError } from '../../../shared/application-command-contract'
import {
  SCHEMA_NOTEBOOK_TABLE_MISSING_CODE,
  type CategoricalOptInRequest,
  type ExecuteAnalysisRequest,
  type ImportTableRequest
} from '../../../shared/schema-notebook'
import { englishNativeTranslator, type NativeTranslator } from '../../locale/main-process-messages'
import { createSchemaNotebookService, type SchemaNotebookService } from './service'

// These handlers are direct `ipcMainHandle` channels: unlike the application-command adapter, they do
// not return an `{ ok, error }` envelope. A rejection therefore reaches the renderer as a plain Error
// wrapped in "Error invoking remote method '…': Error: …", so the shared #24 mapper (which reads a code
// from an envelope) cannot localize it here. The main process renders the operable sentence instead.
//
// This code is intentionally carried only over the direct path. If a future change ships it as an
// envelope or through the preload's "[code] message" bridge, the mapper in
// renderer/src/lib/application-command-error-message.ts must handle the code explicitly, otherwise its
// default "the app could not complete that action" copy would hide the actionable sentence.
const localizeTableMissing =
  (translate: NativeTranslator): ((error: unknown) => never) =>
  (error) => {
    if (
      error instanceof ApplicationCommandError &&
      error.code === SCHEMA_NOTEBOOK_TABLE_MISSING_CODE
    ) {
      // The panel shows this message as-is, so it must be operable copy with the stable code and must
      // never contain the missing file path.
      throw new Error(
        translate(
          'The table file from the previous import is missing or cannot be read, so the analysis was not run. Choose the table file again, then run. (Code: {{code}})',
          { code: error.code }
        )
      )
    }
    throw error
  }

export const registerSchemaNotebookIpc = (
  options: {
    directory: string
    approvalLogPath: string
    translate?: NativeTranslator
  },
  service: SchemaNotebookService = createSchemaNotebookService(options)
): SchemaNotebookService => {
  const translate = options.translate ?? englishNativeTranslator
  const missingTable = localizeTableMissing(translate)
  ipcMainHandle('schema-notebook:import-table', (_event, request: ImportTableRequest) =>
    service.importTable(request)
  )
  ipcMainHandle(
    'schema-notebook:opt-in-categorical',
    async (_event, request: CategoricalOptInRequest) => {
      try {
        return await service.optInCategorical(request)
      } catch (error) {
        return missingTable(error)
      }
    }
  )
  ipcMainHandle(
    'schema-notebook:model-context',
    async (_event, request: { projectId: string; tableId: string }) => {
      try {
        return await service.modelContext(request.projectId, request.tableId)
      } catch (error) {
        return missingTable(error)
      }
    }
  )
  ipcMainHandle('schema-notebook:execute', async (_event, request: ExecuteAnalysisRequest) => {
    try {
      return await service.execute(request)
    } catch (error) {
      return missingTable(error)
    }
  })
  ipcMainHandle('schema-notebook:patient-data-tags', () => service.patientDataTags())
  return service
}
