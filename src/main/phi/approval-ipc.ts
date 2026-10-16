import { join } from 'node:path'

import { getUserDataPath } from '../user-data-path'

import type {
  MachineApprovalStatus,
  SetMachineApprovalRequest
} from '../../shared/machine-approval'
import { ipcMainHandle } from '../ipc-handler-registry'
import { createMachineApprovalLog } from './approval'
import { machineApprovalLogPath } from './production-gate'

export type MachineApprovalCommandOwner = Readonly<{
  getStatus: () => Promise<MachineApprovalStatus>
  setStatus: (request: SetMachineApprovalRequest) => Promise<MachineApprovalStatus>
}>

const statusFromLog = (log: ReturnType<typeof createMachineApprovalLog>): MachineApprovalStatus => {
  try {
    const latest = log.read().at(-1)
    if (!latest?.approved || !latest.approvalNumber) {
      return { approved: false, approvalNumber: null, at: latest?.at ?? null }
    }
    return { approved: true, approvalNumber: latest.approvalNumber, at: latest.at }
  } catch {
    return { approved: false, approvalNumber: null, at: null }
  }
}

const readRequest = (value: unknown): SetMachineApprovalRequest => {
  if (!value || typeof value !== 'object') {
    throw new Error('Hospital approval request is invalid.')
  }
  const record = value as { approved?: unknown; approvalNumber?: unknown }
  if (typeof record.approved !== 'boolean') {
    throw new Error('Hospital approval request is invalid.')
  }
  if (record.approvalNumber != null && typeof record.approvalNumber !== 'string') {
    throw new Error('Hospital approval request is invalid.')
  }
  return {
    approved: record.approved,
    ...(typeof record.approvalNumber === 'string' ? { approvalNumber: record.approvalNumber } : {})
  }
}

export function createMachineApprovalCommandOwner(
  filePath = machineApprovalLogPath(join(getUserDataPath(), 'phi-vault'))
): MachineApprovalCommandOwner {
  const log = createMachineApprovalLog(filePath)
  return {
    getStatus: async () => statusFromLog(log),
    setStatus: async (request) => {
      const decision = readRequest(request)
      const approvalNumber = decision.approvalNumber?.trim() ?? ''
      if (decision.approved && approvalNumber.length === 0) {
        throw new Error('Enter the hospital approval number.')
      }
      log.append({
        approved: decision.approved,
        approvalNumber: decision.approved ? approvalNumber : null
      })
      return statusFromLog(log)
    }
  }
}

export function registerMachineApprovalIpcHandlers(
  owner: MachineApprovalCommandOwner
): MachineApprovalCommandOwner {
  ipcMainHandle('machine-approval:get-status', () => owner.getStatus())
  ipcMainHandle('machine-approval:set-status', (_event, request: unknown) =>
    owner.setStatus(readRequest(request))
  )
  return owner
}
