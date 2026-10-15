import type {
  CategoricalOptInRequest,
  ExecuteAnalysisRequest,
  ExecuteAnalysisResponse,
  ImportTableRequest,
  ImportTableResponse,
  PatientDataTag,
  SchemaModelContext
} from '../../../shared/schema-notebook'
import {
  defineApplicationCommand,
  defineApplicationCommandGroup,
  type ApplicationCommandInstallation,
  type ApplicationCommandRegistrar
} from '../../application-command-router'
import type { CallerContext } from '../../caller-context'
import type { SchemaNotebookService } from './service'

const assertLocalCaller = (callerContext: CallerContext, commandName: string): void => {
  if (callerContext.location !== 'local') {
    throw new Error(`Channel only available from the local app: ${commandName}`)
  }
}

const schemaNotebookExecuteCommand = defineApplicationCommand<
  'schema-notebook:execute',
  readonly [request: ExecuteAnalysisRequest],
  ExecuteAnalysisResponse
>('schema-notebook:execute')

const schemaNotebookImportTableCommand = defineApplicationCommand<
  'schema-notebook:import-table',
  readonly [request: ImportTableRequest],
  ImportTableResponse
>('schema-notebook:import-table')

const schemaNotebookModelContextCommand = defineApplicationCommand<
  'schema-notebook:model-context',
  readonly [request: { projectId: string; tableId: string }],
  SchemaModelContext
>('schema-notebook:model-context')

const schemaNotebookOptInCategoricalCommand = defineApplicationCommand<
  'schema-notebook:opt-in-categorical',
  readonly [request: CategoricalOptInRequest],
  SchemaModelContext
>('schema-notebook:opt-in-categorical')

const schemaNotebookPatientDataTagsCommand = defineApplicationCommand<
  'schema-notebook:patient-data-tags',
  readonly [],
  PatientDataTag[]
>('schema-notebook:patient-data-tags')

const schemaNotebookApplicationCommandGroup = defineApplicationCommandGroup('schema-notebook', [
  schemaNotebookExecuteCommand,
  schemaNotebookImportTableCommand,
  schemaNotebookModelContextCommand,
  schemaNotebookOptInCategoricalCommand,
  schemaNotebookPatientDataTagsCommand
] as const)

const registerSchemaNotebookApplicationCommands = (
  registrar: ApplicationCommandRegistrar,
  service: SchemaNotebookService
): ApplicationCommandInstallation => {
  const scope = registrar.createScope()
  try {
    scope.registerGroup(schemaNotebookApplicationCommandGroup, {
      'schema-notebook:execute': (invocation) => {
        assertLocalCaller(invocation.callerContext, schemaNotebookExecuteCommand.name)
        return service.execute(invocation.args[0])
      },
      'schema-notebook:import-table': (invocation) => {
        assertLocalCaller(invocation.callerContext, schemaNotebookImportTableCommand.name)
        return service.importTable(invocation.args[0])
      },
      'schema-notebook:model-context': (invocation) => {
        assertLocalCaller(invocation.callerContext, schemaNotebookModelContextCommand.name)
        return service.modelContext(invocation.args[0].projectId, invocation.args[0].tableId)
      },
      'schema-notebook:opt-in-categorical': (invocation) => {
        assertLocalCaller(invocation.callerContext, schemaNotebookOptInCategoricalCommand.name)
        return service.optInCategorical(invocation.args[0])
      },
      'schema-notebook:patient-data-tags': (invocation) => {
        assertLocalCaller(invocation.callerContext, schemaNotebookPatientDataTagsCommand.name)
        return service.patientDataTags()
      }
    })
    return scope.complete()
  } catch (error) {
    scope.rollback()
    throw error
  }
}

export { registerSchemaNotebookApplicationCommands, schemaNotebookApplicationCommandGroup }
