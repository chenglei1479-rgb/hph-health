import { callable, LOCAL } from './definition'
import type { EthicsProtocolState } from '../ethics-protocol/state'

export const contracts = {
  'writingSafeguards.getEthicsApproval': callable<
    (request: { projectId: string }) => Promise<{ approvalNumber: string }>
  >()('writing-safeguards', ['writing-safeguards:get-ethics-approval', LOCAL]),
  'writingSafeguards.setEthicsApproval': callable<
    (request: { projectId: string; approvalNumber: string }) => Promise<{ approvalNumber: string }>
  >()('writing-safeguards', ['writing-safeguards:set-ethics-approval', LOCAL]),
  'writingSafeguards.getEthicsProtocol': callable<
    (request: { projectId: string }) => Promise<EthicsProtocolState>
  >()('writing-safeguards', ['writing-safeguards:get-ethics-protocol', LOCAL]),
  'writingSafeguards.setEthicsProtocol': callable<
    (request: { projectId: string; protocol: EthicsProtocolState }) => Promise<EthicsProtocolState>
  >()('writing-safeguards', ['writing-safeguards:set-ethics-protocol', LOCAL]),
  'writingSafeguards.importEthicsDocx': callable<
    (request: {
      projectId: string
      fileName: string
      bytes: number[]
    }) => Promise<{ fileName: string }>
  >()('writing-safeguards', ['writing-safeguards:import-ethics-docx', LOCAL]),
  'writingSafeguards.exportEthicsDraft': callable<
    (request: { projectId: string }) => Promise<{ fileName: string; bytes: number[] }>
  >()('writing-safeguards', ['writing-safeguards:export-ethics-draft', LOCAL])
} as const
