import type {
  CategoricalOptInRequest,
  ExecuteAnalysisRequest,
  ExecuteAnalysisResponse,
  ImportTableRequest,
  ImportTableResponse,
  PatientDataTag,
  SchemaModelContext
} from '../schema-notebook'
import { callable, LOCAL } from './definition'

export const contracts = {
  'schemaNotebook.importTable': callable<
    (request: ImportTableRequest) => Promise<ImportTableResponse>
  >()('schema-notebook', ['schema-notebook:import-table', LOCAL]),
  'schemaNotebook.optInCategorical': callable<
    (request: CategoricalOptInRequest) => Promise<SchemaModelContext>
  >()('schema-notebook', ['schema-notebook:opt-in-categorical', LOCAL]),
  'schemaNotebook.modelContext': callable<
    (request: { projectId: string; tableId: string }) => Promise<SchemaModelContext>
  >()('schema-notebook', ['schema-notebook:model-context', LOCAL]),
  'schemaNotebook.execute': callable<
    (request: ExecuteAnalysisRequest) => Promise<ExecuteAnalysisResponse>
  >()('schema-notebook', ['schema-notebook:execute', LOCAL]),
  'schemaNotebook.patientDataTags': callable<() => Promise<PatientDataTag[]>>()('schema-notebook', [
    'schema-notebook:patient-data-tags',
    LOCAL
  ])
} as const
