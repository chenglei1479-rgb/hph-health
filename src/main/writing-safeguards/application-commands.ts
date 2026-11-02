import { normalizeEthicsApprovalNumber } from '../../shared/writing-safeguards/ethics-approval'
import type { EthicsProtocolState } from '../../shared/ethics-protocol/state'
import {
  ETHICS_DRAFT_FILE_NAME,
  type EthicsDraftExportResult
} from '../../shared/ethics-protocol/draft-export'
import { mapHeading, type HeadingCandidate } from '../../shared/ethics-protocol/heading-mapper'
import { basename, join } from 'node:path'
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { buildEthicsDraftSections } from '../ethics-protocol/draft-sections'
import { inspectPhiSafeDocxHeadings } from '../ethics-protocol/docx-import'
import { EthicsExportPhiError, exportDraftAfterPhiCheck } from '../ethics-protocol/export-phi-gate'
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
  getProtocol: (projectId: string) => EthicsProtocolState
  setProtocol: (projectId: string, protocol: EthicsProtocolState) => EthicsProtocolState
}>

type WritingSafeguardsCommandOwner = Readonly<{
  getEthicsApproval: (request: EthicsApprovalRequest | undefined) => { approvalNumber: string }
  setEthicsApproval: (request: EthicsApprovalRequest | undefined) => { approvalNumber: string }
  getEthicsProtocol: (request: { projectId?: string } | undefined) => EthicsProtocolState
  setEthicsProtocol: (
    request: { projectId?: string; protocol?: EthicsProtocolState } | undefined
  ) => EthicsProtocolState
  importEthicsDocx: (
    request: { projectId?: string; fileName?: string; bytes?: number[] } | undefined
  ) => Promise<{ fileName: string; headingCandidates: HeadingCandidate[] }>
  exportEthicsDraft: (
    request: { projectId?: string } | undefined
  ) => Promise<EthicsDraftExportResult>
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
const getProtocolCommand = defineApplicationCommand<
  'writing-safeguards:get-ethics-protocol',
  readonly [request: { projectId?: string }],
  EthicsProtocolState
>('writing-safeguards:get-ethics-protocol')
const setProtocolCommand = defineApplicationCommand<
  'writing-safeguards:set-ethics-protocol',
  readonly [request: { projectId?: string; protocol?: EthicsProtocolState }],
  EthicsProtocolState
>('writing-safeguards:set-ethics-protocol')
const importDocxCommand = defineApplicationCommand<
  'writing-safeguards:import-ethics-docx',
  readonly [request: { projectId?: string; fileName?: string; bytes?: number[] }],
  { fileName: string }
>('writing-safeguards:import-ethics-docx')
const exportDraftCommand = defineApplicationCommand<
  'writing-safeguards:export-ethics-draft',
  readonly [request: { projectId?: string }],
  Promise<EthicsDraftExportResult>
>('writing-safeguards:export-ethics-draft')

const writingSafeguardsApplicationCommandGroup = defineApplicationCommandGroup(
  'writing-safeguards',
  [
    writingSafeguardsGetEthicsApprovalCommand,
    writingSafeguardsSetEthicsApprovalCommand,
    getProtocolCommand,
    setProtocolCommand,
    importDocxCommand,
    exportDraftCommand
  ] as const
)

const createWritingSafeguardsCommandOwner = (
  store: EthicsApprovalStore,
  protocolRoot = join(process.cwd(), '.ethics-protocols'),
  inspectHeadings = inspectPhiSafeDocxHeadings
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
    }),
    getEthicsProtocol: (request) => store.getProtocol(request?.projectId ?? ''),
    setEthicsProtocol: (request) =>
      store.setProtocol(
        request?.projectId ?? '',
        request?.protocol ?? { choices: {}, notApplicableReasons: {}, confirmedMappings: [] }
      ),
    importEthicsDocx: async (request) => {
      const projectId = request?.projectId?.trim() ?? ''
      if (!projectId) throw new Error('projectId is required.')
      const fileName = basename(request?.fileName ?? '')
      const directory = join(protocolRoot, projectId.replace(/[^a-zA-Z0-9_-]/gu, '_'))
      mkdirSync(directory, { recursive: true })
      const filePath = join(directory, fileName)
      const temporaryPath = `${filePath}.importing.docx`
      writeFileSync(temporaryPath, Uint8Array.from(request?.bytes ?? []), { mode: 0o600 })
      let headingCandidates: HeadingCandidate[]
      try {
        headingCandidates = (await inspectHeadings(temporaryPath)).map(mapHeading)
      } catch (error) {
        rmSync(temporaryPath, { force: true })
        throw error
      }
      renameSync(temporaryPath, filePath)
      store.setProtocol(projectId, {
        ...store.getProtocol(projectId),
        importedDocxPath: filePath,
        headingCandidates
      })
      return { fileName, headingCandidates }
    },
    // #132: every way this can end is a value the panel can render — success with bytes, or a
    // code that names the reason. A thrown rejection used to vanish in the renderer, so a refusal
    // looked exactly like a dead button and the doctor clicked it repeatedly.
    exportEthicsDraft: async (request) => {
      const projectId = request?.projectId?.trim() ?? ''
      if (!projectId)
        return { ok: false, code: 'ethics-draft-project-missing', fileName: ETHICS_DRAFT_FILE_NAME }
      const state = store.getProtocol(projectId)
      const { sections, missingItems } = buildEthicsDraftSections(state)
      try {
        const bytes = await exportDraftAfterPhiCheck({
          sections,
          missingItems,
          phiTexts: Object.values(state.notApplicableReasons).filter((reason): reason is string =>
            Boolean(reason?.trim())
          )
        })
        return { ok: true, fileName: ETHICS_DRAFT_FILE_NAME, bytes: [...bytes] }
      } catch (error) {
        // The refusal carries no matched text: the doctor sees that something was treated as
        // patient information, never a list of the strings that were found.
        const code =
          error instanceof EthicsExportPhiError ? 'ethics-draft-blocked-phi' : 'ethics-draft-failed'
        return { ok: false, code, fileName: ETHICS_DRAFT_FILE_NAME }
      }
    }
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
      },
      'writing-safeguards:get-ethics-protocol': (invocation) => {
        assertLocalCaller(invocation.callerContext, getProtocolCommand.name)
        return owner.getEthicsProtocol(invocation.args[0])
      },
      'writing-safeguards:set-ethics-protocol': (invocation) => {
        assertLocalCaller(invocation.callerContext, setProtocolCommand.name)
        return owner.setEthicsProtocol(invocation.args[0])
      },
      'writing-safeguards:import-ethics-docx': (invocation) => {
        assertLocalCaller(invocation.callerContext, importDocxCommand.name)
        return owner.importEthicsDocx(invocation.args[0])
      },
      'writing-safeguards:export-ethics-draft': (invocation) => {
        assertLocalCaller(invocation.callerContext, exportDraftCommand.name)
        return owner.exportEthicsDraft(invocation.args[0])
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
