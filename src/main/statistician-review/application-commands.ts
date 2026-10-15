import type { StatisticianReviewExportResponse } from '../../shared/statistician-review-export'
import {
  defineApplicationCommand,
  defineApplicationCommandGroup,
  type ApplicationCommandInstallation,
  type ApplicationCommandRegistrar
} from '../application-command-router'
import type { CallerContext } from '../caller-context'
import { englishNativeTranslator, type NativeTranslator } from '../locale/main-process-messages'
import { createStatisticianExportConfirmer } from './confirm-window'
import { exportStatisticianReviewPackage } from './export'

type StatisticianReviewCommandOwner = Readonly<{
  exportPackage: (request: unknown) => Promise<StatisticianReviewExportResponse>
}>

const assertLocalCaller = (callerContext: CallerContext, commandName: string): void => {
  if (callerContext.location !== 'local') {
    throw new Error(`Channel only available from the local app: ${commandName}`)
  }
}

const statisticianReviewExportPackageCommand = defineApplicationCommand<
  'statistician-review:export-package',
  readonly [request: unknown],
  StatisticianReviewExportResponse
>('statistician-review:export-package')

const statisticianReviewApplicationCommandGroup = defineApplicationCommandGroup(
  'statistician-review',
  [statisticianReviewExportPackageCommand] as const
)

const createStatisticianReviewCommandOwner = (
  translate: NativeTranslator = englishNativeTranslator
): StatisticianReviewCommandOwner =>
  Object.freeze({
    exportPackage: (request) =>
      exportStatisticianReviewPackage(request, {
        confirm: createStatisticianExportConfirmer(translate)
      })
  })

const registerStatisticianReviewApplicationCommands = (
  registrar: ApplicationCommandRegistrar,
  owner: StatisticianReviewCommandOwner
): ApplicationCommandInstallation => {
  const scope = registrar.createScope()
  try {
    scope.registerGroup(statisticianReviewApplicationCommandGroup, {
      'statistician-review:export-package': (invocation) => {
        assertLocalCaller(invocation.callerContext, statisticianReviewExportPackageCommand.name)
        return owner.exportPackage(invocation.args[0])
      }
    })
    return scope.complete()
  } catch (error) {
    scope.rollback()
    throw error
  }
}

export {
  createStatisticianReviewCommandOwner,
  registerStatisticianReviewApplicationCommands,
  statisticianReviewApplicationCommandGroup
}
export type { StatisticianReviewCommandOwner }
