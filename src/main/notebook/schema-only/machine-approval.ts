import { readFileSync } from 'node:fs'

// Same append-only record shape as `createMachineApprovalLog` in PR #7
// (`src/main/phi/approval.ts`). A missing or unreadable log is not approved.

type ApprovalRecord = {
  approved?: unknown
  approvalNumber?: unknown
}

const parseRecord = (line: string): ApprovalRecord | null => {
  try {
    const parsed: unknown = JSON.parse(line)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as ApprovalRecord
  } catch {
    return null
  }
}

export const isHospitalApproved = (logPath: string): boolean => {
  let raw: string
  try {
    raw = readFileSync(logPath, 'utf8')
  } catch {
    return false
  }
  const records = raw
    .split('\n')
    .filter((line) => line.length > 0)
    .map(parseRecord)
  if (records.some((record) => record === null)) return false
  const latest = records.at(-1)
  return Boolean(
    latest &&
    latest.approved === true &&
    typeof latest.approvalNumber === 'string' &&
    latest.approvalNumber.trim().length > 0
  )
}
