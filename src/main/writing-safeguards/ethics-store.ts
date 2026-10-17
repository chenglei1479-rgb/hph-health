import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { normalizeEthicsApprovalNumber } from '../../shared/writing-safeguards/ethics-approval'
import {
  emptyEthicsProtocolState,
  type EthicsProtocolState
} from '../../shared/ethics-protocol/state'

type StoredApproval = {
  approvalNumber: string
  updatedAt: string
  protocol?: EthicsProtocolState
}

const readMap = (filePath: string): Record<string, StoredApproval> => {
  let raw: string
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }
  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  return parsed as Record<string, StoredApproval>
}

export const createEthicsApprovalStore = (
  filePath: string,
  now: () => Date = () => new Date()
): {
  get: (projectId: string) => string
  set: (projectId: string, approvalNumber: string) => string
  getProtocol: (projectId: string) => EthicsProtocolState
  setProtocol: (projectId: string, protocol: EthicsProtocolState) => EthicsProtocolState
} => {
  const requireProject = (projectId: string): string => {
    const id = projectId.trim()
    if (!id) throw new Error('projectId is required.')
    return id
  }
  return {
    get(projectId) {
      const id = requireProject(projectId)
      return normalizeEthicsApprovalNumber(readMap(filePath)[id]?.approvalNumber ?? '')
    },
    set(projectId, approvalNumber) {
      const id = requireProject(projectId)
      const stored = normalizeEthicsApprovalNumber(approvalNumber)
      const next = readMap(filePath)
      next[id] = { approvalNumber: stored, updatedAt: now().toISOString() }
      mkdirSync(dirname(filePath), { recursive: true })
      writeFileSync(filePath, `${JSON.stringify(next)}\n`, { encoding: 'utf8', mode: 0o600 })
      return stored
    },
    getProtocol(projectId) {
      const id = requireProject(projectId)
      return readMap(filePath)[id]?.protocol ?? emptyEthicsProtocolState()
    },
    setProtocol(projectId, protocol) {
      const id = requireProject(projectId)
      const next = readMap(filePath)
      next[id] = {
        approvalNumber: next[id]?.approvalNumber ?? '',
        updatedAt: now().toISOString(),
        protocol
      }
      mkdirSync(dirname(filePath), { recursive: true })
      writeFileSync(filePath, `${JSON.stringify(next)}\n`, { encoding: 'utf8', mode: 0o600 })
      return protocol
    }
  }
}
