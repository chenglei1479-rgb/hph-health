import { ipcMainHandle } from '../../ipc-handler-registry'
import { ApplicationCommandError } from '../../../shared/application-command-contract'
import {
  SCHEMA_NOTEBOOK_CSV_ENCODING_CODE,
  SCHEMA_NOTEBOOK_PYTHON_UNAVAILABLE_CODE,
  SCHEMA_NOTEBOOK_RUN_OUTPUT_LIMIT_CODE,
  SCHEMA_NOTEBOOK_RUN_OUTPUT_MISSING_CODE,
  SCHEMA_NOTEBOOK_RUN_OUTPUT_UNREADABLE_CODE,
  SCHEMA_NOTEBOOK_TABLE_MISSING_CODE,
  type CategoricalOptInRequest,
  type ExecuteAnalysisRequest,
  type ImportTableRequest,
  type SaveSchemaNotebookOutputRequest
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
const localizeSchemaNotebookFailure =
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
    if (
      error instanceof ApplicationCommandError &&
      error.code === SCHEMA_NOTEBOOK_PYTHON_UNAVAILABLE_CODE
    ) {
      // Same reasoning: the user's next step is to reinstall, not to edit the script. The sentence must
      // not say "not found", and it must not name the interpreter path.
      throw new Error(
        translate(
          'The bundled Python runtime could not start, so the analysis was not run. Reinstall the app. (Code: {{code}})',
          { code: error.code }
        )
      )
    }
    if (
      error instanceof ApplicationCommandError &&
      error.code === SCHEMA_NOTEBOOK_CSV_ENCODING_CODE
    ) {
      // The file decoded as neither UTF-8 nor CP932. Naming the encodings is the usable next step;
      // "save it as UTF-8" alone would push the conversion back onto the user. The stable code rides
      // along like the other two: without it this failure left no trace a support report could quote.
      throw new Error(
        translate('Choose a CSV file in UTF-8 or Shift-JIS. (Code: {{code}})', {
          code: error.code
        })
      )
    }
    if (
      error instanceof ApplicationCommandError &&
      error.code === SCHEMA_NOTEBOOK_RUN_OUTPUT_MISSING_CODE
    ) {
      // One sentence covers both reasons the service reports (the file is gone, or its bytes changed),
      // and the next step is the same for both: run the analysis again. The stable code rides along so
      // a support report can quote it.
      throw new Error(
        translate(
          'The output files from that run are missing or changed, so the file was not saved. Run the analysis again. (Code: {{code}})',
          { code: error.code }
        )
      )
    }
    if (
      error instanceof ApplicationCommandError &&
      error.code === SCHEMA_NOTEBOOK_RUN_OUTPUT_LIMIT_CODE
    ) {
      // The run finished but its files could not be recorded, so the run directory was removed. The caps
      // are part of the sentence: without them the user cannot tell why a 200-file loop failed.
      throw new Error(
        translate(
          'The output files from that run could not be saved, so its results were not kept (up to 200 files and 512 MB per run). Run the analysis again. (Code: {{code}})',
          { code: error.code }
        )
      )
    }
    if (
      error instanceof ApplicationCommandError &&
      error.code === SCHEMA_NOTEBOOK_RUN_OUTPUT_UNREADABLE_CODE
    ) {
      // No caps in this sentence: a file that could not be read back has nothing to do with a limit, and
      // quoting one would send the user looking for a size problem that does not exist.
      throw new Error(
        translate(
          'The output files from that run could not be read, so its results were not kept. Run the analysis again. (Code: {{code}})',
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
  const localizeFailure = localizeSchemaNotebookFailure(translate)
  ipcMainHandle('schema-notebook:import-table', async (_event, request: ImportTableRequest) => {
    try {
      return await service.importTable(request)
    } catch (error) {
      return localizeFailure(error)
    }
  })
  ipcMainHandle(
    'schema-notebook:opt-in-categorical',
    async (_event, request: CategoricalOptInRequest) => {
      try {
        return await service.optInCategorical(request)
      } catch (error) {
        return localizeFailure(error)
      }
    }
  )
  ipcMainHandle(
    'schema-notebook:model-context',
    async (_event, request: { projectId: string; tableId: string }) => {
      try {
        return await service.modelContext(request.projectId, request.tableId)
      } catch (error) {
        return localizeFailure(error)
      }
    }
  )
  ipcMainHandle('schema-notebook:execute', async (_event, request: ExecuteAnalysisRequest) => {
    try {
      return await service.execute(request)
    } catch (error) {
      return localizeFailure(error)
    }
  })
  ipcMainHandle(
    'schema-notebook:save-output',
    async (_event, request: SaveSchemaNotebookOutputRequest) => {
      try {
        return await service.saveOutput(request)
      } catch (error) {
        return localizeFailure(error)
      }
    }
  )
  ipcMainHandle(
    'schema-notebook:last-run',
    async (_event, request: { projectId: string; tableId: string }) => {
      try {
        return await service.lastRun(request.projectId, request.tableId)
      } catch (error) {
        return localizeFailure(error)
      }
    }
  )
  ipcMainHandle('schema-notebook:patient-data-tags', () => service.patientDataTags())
  return service
}
