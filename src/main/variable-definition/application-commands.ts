import type {
  ExportVariableDefinitionRequest,
  ExportVariableDefinitionResponse,
  GenerateVariableDefinitionRequest,
  VariableDefinitionTable
} from '../../shared/variable-definition'
import {
  defineApplicationCommand,
  defineApplicationCommandGroup,
  type ApplicationCommandInstallation,
  type ApplicationCommandRegistrar
} from '../application-command-router'
import type { CallerContext } from '../caller-context'
import type { VariableDefinitionService } from './service'

const assertLocalCaller = (callerContext: CallerContext, commandName: string): void => {
  if (callerContext.location !== 'local') {
    throw new Error(`Channel only available from the local app: ${commandName}`)
  }
}

const variableDefinitionGenerateCommand = defineApplicationCommand<
  'variable-definition:generate',
  readonly [request: GenerateVariableDefinitionRequest],
  VariableDefinitionTable
>('variable-definition:generate')

const variableDefinitionExportTemplateCommand = defineApplicationCommand<
  'variable-definition:export-template',
  readonly [request: ExportVariableDefinitionRequest],
  ExportVariableDefinitionResponse
>('variable-definition:export-template')

const variableDefinitionApplicationCommandGroup = defineApplicationCommandGroup(
  'variable-definition',
  [variableDefinitionExportTemplateCommand, variableDefinitionGenerateCommand] as const
)

const registerVariableDefinitionApplicationCommands = (
  registrar: ApplicationCommandRegistrar,
  service: VariableDefinitionService
): ApplicationCommandInstallation => {
  const scope = registrar.createScope()
  try {
    scope.registerGroup(variableDefinitionApplicationCommandGroup, {
      'variable-definition:generate': (invocation) => {
        assertLocalCaller(invocation.callerContext, variableDefinitionGenerateCommand.name)
        return service.generate(invocation.args[0])
      },
      'variable-definition:export-template': (invocation) => {
        assertLocalCaller(invocation.callerContext, variableDefinitionExportTemplateCommand.name)
        return service.exportTemplate(invocation.args[0].table)
      }
    })
    return scope.complete()
  } catch (error) {
    scope.rollback()
    throw error
  }
}

export { registerVariableDefinitionApplicationCommands, variableDefinitionApplicationCommandGroup }
