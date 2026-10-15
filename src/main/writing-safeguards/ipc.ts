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
}
