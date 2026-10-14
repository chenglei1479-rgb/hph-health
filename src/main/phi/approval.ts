import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

import type { NativeTranslator } from '../locale/main-process-messages'

export interface MachineApprovalRecord {
  at: string
  approved: boolean
  approvalNumber: string | null
}

export interface MachineApprovalDecision {
  approved: boolean
  approvalNumber: string
}

export interface MachineApprovalLog {
  read(): MachineApprovalRecord[]
  append(decision: { approved: boolean; approvalNumber: string | null }): MachineApprovalRecord
  isApproved(): boolean
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/

function parseRecord(line: string): MachineApprovalRecord {
  const parsed: unknown = JSON.parse(line)
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('PHI approval log is unreadable.')
  }
  const record = parsed as {
    at?: unknown
    approved?: unknown
    approvalNumber?: unknown
  }
  if (
    typeof record.at !== 'string' ||
    !TIMESTAMP.test(record.at) ||
    typeof record.approved !== 'boolean' ||
    (record.approvalNumber != null && typeof record.approvalNumber !== 'string')
  ) {
    throw new Error('PHI approval log is unreadable.')
  }
  return {
    at: record.at,
    approved: record.approved,
    approvalNumber: record.approvalNumber ?? null
  }
}

// Append-only. The application never rewrites or truncates this file. A machine is approved only
// when the latest readable record says so and carries the approval number the user entered.
export function createMachineApprovalLog(
  filePath: string,
  now: () => Date = () => new Date()
): MachineApprovalLog {
  const read = (): MachineApprovalRecord[] => {
    let raw: string
    try {
      raw = readFileSync(filePath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    return raw
      .split('\n')
      .filter((line) => line.length > 0)
      .map(parseRecord)
  }
  return {
    read,
    append(decision) {
      const approvalNumber = decision.approvalNumber?.trim() ?? ''
      const approved = decision.approved === true && approvalNumber.length > 0
      const record: MachineApprovalRecord = {
        at: now().toISOString(),
        approved,
        approvalNumber: approved ? approvalNumber : null
      }
      mkdirSync(dirname(filePath), { recursive: true })
      appendFileSync(filePath, `${JSON.stringify(record)}\n`, {
        encoding: 'utf8',
        flag: 'a',
        mode: 0o600
      })
      return record
    },
    isApproved() {
      try {
        const latest = read().at(-1)
        return Boolean(
          latest?.approved && latest.approvalNumber && latest.approvalNumber.length > 0
        )
      } catch {
        return false
      }
    }
  }
}

export function formatUnapprovedBlock(
  spans: readonly string[],
  translate: NativeTranslator
): string {
  return translate(
    'This machine is not approved by the hospital. The request was not sent. Edit these spans and try again: {{spans}}',
    { spans: spans.join('\n') }
  )
}

export interface ApprovalLabels {
  title: string
  explanation: string
  number: string
  approve: string
  decline: string
}

export const APPROVAL_PREFIX = 'PHI_APPROVAL '

export function approvalLabels(translate: NativeTranslator): ApprovalLabels {
  return {
    title: translate('Is this machine approved by the hospital?'),
    explanation: translate(
      'This machine is not approved until you enter the hospital approval number and confirm. Closing this window leaves it not approved.'
    ),
    number: translate('Approval number'),
    approve: translate('This machine is approved'),
    decline: translate('Not approved')
  }
}

export function parseApprovalDecision(message: string): MachineApprovalDecision | null {
  if (!message.startsWith(APPROVAL_PREFIX)) return null
  const parsed: unknown = JSON.parse(message.slice(APPROVAL_PREFIX.length))
  if (!parsed || typeof parsed !== 'object') return null
  const record = parsed as { approved?: unknown; approvalNumber?: unknown }
  return {
    approved: record.approved === true,
    approvalNumber: typeof record.approvalNumber === 'string' ? record.approvalNumber : ''
  }
}

// The decline button is focused. Approve stays disabled until an approval number is present.
export function buildApprovalInstaller(labels: ApprovalLabels): string {
  const payload = JSON.stringify({ labels, prefix: APPROVAL_PREFIX }).replace(/</g, '\\u003c')
  return `(() => {
    const payload = ${payload}
    const style = document.createElement('style')
    style.textContent = 'body{margin:0;font:14px/1.5 sans-serif;color:#1c1917;background:#fafaf9}main{padding:16px}p{margin:8px 0 0;color:#44403c}label{display:block;margin-top:16px}input{display:block;width:100%;box-sizing:border-box;margin-top:4px;font:inherit;padding:6px 8px}footer{display:flex;gap:8px;justify-content:flex-end;padding:12px 16px;border-top:1px solid #e7e5e4}button{font:inherit;padding:6px 12px}'
    document.head.replaceChildren(style)
    document.title = payload.labels.title
    const main = document.createElement('main')
    const heading = document.createElement('strong')
    heading.textContent = payload.labels.title
    const explanation = document.createElement('p')
    explanation.textContent = payload.labels.explanation
    const label = document.createElement('label')
    label.textContent = payload.labels.number
    const input = document.createElement('input')
    input.id = 'approval-number'
    input.type = 'text'
    input.autocomplete = 'off'
    label.append(input)
    main.append(heading, explanation, label)
    const footer = document.createElement('footer')
    const decline = document.createElement('button')
    decline.type = 'button'
    decline.id = 'decline'
    decline.autofocus = true
    decline.textContent = payload.labels.decline
    const approve = document.createElement('button')
    approve.type = 'button'
    approve.id = 'approve'
    approve.disabled = true
    approve.textContent = payload.labels.approve
    footer.append(decline, approve)
    document.body.replaceChildren(main, footer)
    const report = (approved) => console.log(payload.prefix + JSON.stringify({ approved, approvalNumber: input.value }))
    input.addEventListener('input', () => { approve.disabled = input.value.trim().length === 0 })
    approve.addEventListener('click', () => { if (input.value.trim().length > 0) report(true) })
    decline.addEventListener('click', () => report(false))
  })()`
}
