import { join } from 'node:path'

import { ipcMainHandle } from '../ipc-handler-registry'
import { normalizeEthicsApprovalNumber } from '../../shared/writing-safeguards/ethics-approval'
import { createEthicsApprovalStore } from './ethics-store'

type EthicsRequest = {
  projectId?: string
  approvalNumber?: string
}

export const registerWritingSafeguardsIpc = (directory: string): void => {
  const store = createEthicsApprovalStore(join(directory, 'ethics-approval.json'))
  ipcMainHandle('writing-safeguards:get-ethics-approval', (_event, request: EthicsRequest) => ({
    approvalNumber: store.get(request?.projectId ?? '')
  }))
  ipcMainHandle('writing-safeguards:set-ethics-approval', (_event, request: EthicsRequest) => ({
    approvalNumber: store.set(
      request?.projectId ?? '',
      normalizeEthicsApprovalNumber(request?.approvalNumber ?? '')
    )
  }))
}
