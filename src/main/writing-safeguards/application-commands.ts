import { normalizeEthicsApprovalNumber } from '../../shared/writing-safeguards/ethics-approval'
import {
  defineApplicationCommand,
  defineApplicationCommandGroup,
  type ApplicationCommandInstallation,
  type ApplicationCommandRegistrar
} from '../application-command-router'
import type { CallerContext } from '../caller-context'

type EthicsApprovalRequest = {
  projectId?: string
  approvalNumber?: string
}

type EthicsApprovalStore = Readonly<{
  get: (projectId: string) => string
  set: (projectId: string, approvalNumber: string) => string
}>

type WritingSafeguardsCommandOwner = Readonly<{
  getEthicsApproval: (request: EthicsApprovalRequest | undefined) => { approvalNumber: string }
  setEthicsApproval: (request: EthicsApprovalRequest | undefined) => { approvalNumber: string }
}>

const assertLocalCaller = (callerContext: CallerContext, commandName: string): void => {
  if (callerContext.location !== 'local') {
    throw new Error(`Channel only available from the local app: ${commandName}`)
  }
}

const writingSafeguardsGetEthicsApprovalCommand = defineApplicationCommand<
  'writing-safeguards:get-ethics-approval',
  readonly [request: EthicsApprovalRequest],
  { approvalNumber: string }
>('writing-safeguards:get-ethics-approval')

const writingSafeguardsSetEthicsApprovalCommand = defineApplicationCommand<
  'writing-safeguards:set-ethics-approval',
  readonly [request: EthicsApprovalRequest],
  { approvalNumber: string }
>('writing-safeguards:set-ethics-approval')

const writingSafeguardsApplicationCommandGroup = defineApplicationCommandGroup(
  'writing-safeguards',
  [writingSafeguardsGetEthicsApprovalCommand, writingSafeguardsSetEthicsApprovalCommand] as const
)

const createWritingSafeguardsCommandOwner = (
  store: EthicsApprovalStore
): WritingSafeguardsCommandOwner =>
  Object.freeze({
    getEthicsApproval: (request) => ({
      approvalNumber: store.get(request?.projectId ?? '')
    }),
    setEthicsApproval: (request) => ({
      approvalNumber: store.set(
        request?.projectId ?? '',
        normalizeEthicsApprovalNumber(request?.approvalNumber ?? '')
      )
    })
  })

const registerWritingSafeguardsApplicationCommands = (
  registrar: ApplicationCommandRegistrar,
  owner: WritingSafeguardsCommandOwner
): ApplicationCommandInstallation => {
  const scope = registrar.createScope()
  try {
    scope.registerGroup(writingSafeguardsApplicationCommandGroup, {
      'writing-safeguards:get-ethics-approval': (invocation) => {
        assertLocalCaller(invocation.callerContext, writingSafeguardsGetEthicsApprovalCommand.name)
        return owner.getEthicsApproval(invocation.args[0])
      },
      'writing-safeguards:set-ethics-approval': (invocation) => {
        assertLocalCaller(invocation.callerContext, writingSafeguardsSetEthicsApprovalCommand.name)
        return owner.setEthicsApproval(invocation.args[0])
      }
    })
    return scope.complete()
  } catch (error) {
    scope.rollback()
    throw error
  }
}

export {
  createWritingSafeguardsCommandOwner,
  registerWritingSafeguardsApplicationCommands,
  writingSafeguardsApplicationCommandGroup
}
export type { WritingSafeguardsCommandOwner }
