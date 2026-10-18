import { ipcMainHandle } from '../ipc-handler-registry'
import type { WritingSafeguardsCommandOwner } from './application-commands'

type EthicsRequest = {
  projectId?: string
  approvalNumber?: string
}

export const registerWritingSafeguardsIpc = (owner: WritingSafeguardsCommandOwner): void => {
  ipcMainHandle('writing-safeguards:get-ethics-approval', (_event, request: EthicsRequest) =>
    owner.getEthicsApproval(request)
  )
  ipcMainHandle('writing-safeguards:set-ethics-approval', (_event, request: EthicsRequest) =>
    owner.setEthicsApproval(request)
  )
  ipcMainHandle('writing-safeguards:get-ethics-protocol', (_event, request: EthicsRequest) =>
    owner.getEthicsProtocol(request)
  )
  ipcMainHandle('writing-safeguards:set-ethics-protocol', (_event, request) =>
    owner.setEthicsProtocol(request)
  )
  ipcMainHandle('writing-safeguards:import-ethics-docx', (_event, request) =>
    owner.importEthicsDocx(request)
  )
  ipcMainHandle('writing-safeguards:export-ethics-draft', (_event, request) =>
    owner.exportEthicsDraft(request)
  )
}
