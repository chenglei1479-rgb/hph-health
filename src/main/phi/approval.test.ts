import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { AcpProviderPromptExecutor } from '../acp/provider-prompt-executor'
import type { ProviderPromptExecutionInput } from '../acp/provider-prompt-executor'
import { englishNativeTranslator } from '../locale/main-process-messages'
import { fetchProviderRequest } from '../settings/provider-fetch'
import { buildApprovalInstaller, createMachineApprovalLog, parseApprovalDecision } from './approval'
import { ensureMachineApprovalDeclaration } from './approval-window'
import {
  PhiGateError,
  createVaultBackedGate,
  installMachineApproval,
  installPhiConfirmer,
  installPhiGate,
  releaseModelText
} from './gate'
import { createMemoryPhiVault } from './store'

const clock = (): Date => new Date('2026-10-14T03:27:00.000Z')

function logPath(): string {
  return join(mkdtempSync(join(tmpdir(), 'phi-approval-')), 'machine-approval.jsonl')
}

function promptInput(content: string): {
  input: ProviderPromptExecutionInput
  prompt: ReturnType<typeof vi.fn>
} {
  const prompt = vi.fn(async () => ({ stopReason: 'end_turn' }))
  const input = {
    session: {
      sessionId: 'phi-approval',
      prompt,
      nextUpdate: async () => ({ kind: 'stop', response: { stopReason: 'end_turn' } })
    },
    content,
    cwd: '/tmp/phi-approval',
    frameworkId: 'claude-code',
    isCurrent: () => true,
    beforeDispatch: async () => 'active' as const,
    captureStop: () => true,
    onAccepted: () => undefined,
    routeNotification: () => undefined
  } as unknown as ProviderPromptExecutionInput
  return { input, prompt }
}

describe('hospital machine approval', () => {
  it('defaults to not approved and appends the approval number without rewriting earlier lines', () => {
    const path = logPath()
    const log = createMachineApprovalLog(path, clock)
    expect(log.isApproved()).toBe(false)
    expect(log.read()).toEqual([])

    const declined = log.append({ approved: false, approvalNumber: null })
    expect(declined).toEqual({
      at: '2026-10-14T03:27:00.000Z',
      approved: false,
      approvalNumber: null
    })
    expect(log.isApproved()).toBe(false)
    const before = readFileSync(path)

    const approved = createMachineApprovalLog(
      path,
      () => new Date('2026-10-14T04:00:00.000Z')
    ).append({ approved: true, approvalNumber: '  HP-2026-014  ' })
    expect(approved).toEqual({
      at: '2026-10-14T04:00:00.000Z',
      approved: true,
      approvalNumber: 'HP-2026-014'
    })
    const after = readFileSync(path)
    expect(after.subarray(0, before.length).equals(before)).toBe(true)
    expect(after.length).toBeGreaterThan(before.length)
    expect(log.read()).toEqual([
      { at: '2026-10-14T03:27:00.000Z', approved: false, approvalNumber: null },
      { at: '2026-10-14T04:00:00.000Z', approved: true, approvalNumber: 'HP-2026-014' }
    ])
    expect(log.isApproved()).toBe(true)

    const blank = log.append({ approved: true, approvalNumber: '   ' })
    expect(blank.approved).toBe(false)
    expect(blank.approvalNumber).toBeNull()
    expect(log.isApproved()).toBe(false)
    expect(readFileSync(path).subarray(0, after.length).equals(after)).toBe(true)
  })

  it('treats a damaged log as not approved', () => {
    const path = logPath()
    writeFileSync(path, '{"approved":true}\n')
    const log = createMachineApprovalLog(path, clock)
    expect(log.isApproved()).toBe(false)
    expect(() => log.read()).toThrow(/unreadable/)
  })

  it('records the first-launch choice once and does not ask again', async () => {
    const path = logPath()
    const ask = vi.fn(async () => ({ approved: true, approvalNumber: 'HP-14' }))
    await ensureMachineApprovalDeclaration(path, englishNativeTranslator, ask)
    await ensureMachineApprovalDeclaration(path, englishNativeTranslator, ask)
    expect(ask).toHaveBeenCalledOnce()
    const records = createMachineApprovalLog(path).read()
    expect(records).toHaveLength(1)
    expect(records[0]?.approved).toBe(true)
    expect(records[0]?.approvalNumber).toBe('HP-14')
    expect(records[0]?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(createMachineApprovalLog(path).isApproved()).toBe(true)
  })

  it('records a dismissed declaration as not approved', async () => {
    const path = logPath()
    const ask = vi.fn(async () => {
      throw new Error('closed')
    })
    await ensureMachineApprovalDeclaration(path, englishNativeTranslator, ask)
    const [record] = createMachineApprovalLog(path).read()
    expect(record?.approved).toBe(false)
    expect(record?.approvalNumber).toBeNull()
    expect(createMachineApprovalLog(path).isApproved()).toBe(false)
  })

  it('reads the same append-only log the desktop startup records', () => {
    const production = readFileSync(join(__dirname, 'production-gate.ts'), 'utf8')
    const startup = readFileSync(join(__dirname, '../index.ts'), 'utf8')
    expect(production).toContain('installMachineApproval(() => approval.isApproved())')
    expect(production).toContain("join(directory, 'machine-approval.jsonl')")
    expect(startup).toContain(
      'ensureMachineApprovalDeclaration(machineApprovalLogPath(phiDirectory), translate)'
    )
  })

  it('focuses the not-approved choice and keeps approve disabled until a number is entered', () => {
    const page = buildApprovalInstaller({
      title: 'Is this machine approved by the hospital?',
      explanation: 'Leave it <not approved>',
      number: 'Approval number',
      approve: 'This machine is approved',
      decline: 'Not approved'
    })
    expect(page).toContain('decline.autofocus = true')
    expect(page).toContain('approve.disabled = true')
    expect(page).toContain('input.value.trim().length === 0')
    expect(page).not.toContain('<not approved>')
    expect(parseApprovalDecision('PHI_APPROVAL {"approved":false,"approvalNumber":""}')).toEqual({
      approved: false,
      approvalNumber: ''
    })
  })
})

describe('unapproved machine PHI block', () => {
  it('blocks patient PHI with each span and category and does not de-identify or send', async () => {
    const vault = createMemoryPhiVault()
    installMachineApproval(() => false)
    installPhiGate(createVaultBackedGate(vault))
    installPhiConfirmer(async () => {
      throw new Error('confirmer must not run')
    })
    const text = '患者：山田 太郎\nカルテ番号：0083341\n南2病棟 18号室'
    const executor = new AcpProviderPromptExecutor({
      backendGeneration: {
        openCodeUsageApi: () => undefined,
        current: { adapter: { nativeMcpEnabled: true, bridgeMcpAliasesEnabled: false } }
      }
    })
    const { input, prompt } = promptInput(text)
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'))
    try {
      await expect(executor.execute(input)).rejects.toBeInstanceOf(PhiGateError)
      expect(prompt).not.toHaveBeenCalled()
      let blocked: PhiGateError | undefined
      try {
        await releaseModelText(text, 'unapproved')
      } catch (error) {
        blocked = error as PhiGateError
      }
      expect(blocked).toBeInstanceOf(PhiGateError)
      expect(blocked?.message).not.toBe('blocked')
      expect(blocked?.message).toContain('not approved')
      const categories = blocked?.spans.map((span) => span.category).sort()
      expect(categories).toEqual(['FACILITY', 'FACILITY', 'KARTE_NO', 'PERSON_NAME'])
      for (const span of blocked?.spans ?? []) {
        expect(blocked?.message).toContain(span.category)
        expect(blocked?.message).toContain(span.text)
        expect(blocked?.message).toContain(`[${span.start}, ${span.end}]`)
        expect(text.slice(span.start, span.end)).toBe(span.text)
      }
      expect(vault.readLog()).toEqual([])
      await expect(
        fetchProviderRequest(fetchImpl, 'https://gateway.invalid/v1/messages', {
          method: 'POST',
          body: JSON.stringify({ messages: [{ content: text }] })
        })
      ).rejects.toThrow(/PERSON_NAME/)
      expect(fetchImpl).not.toHaveBeenCalled()
    } finally {
      installPhiConfirmer(null)
      installMachineApproval(null)
      installPhiGate({
        release: (value) => ({ text: value, replacements: [], warnings: [] }),
        restore: (value) => value
      })
    }
  })

  it('still sends text that has no patient PHI', async () => {
    installMachineApproval(() => false)
    installPhiGate(createVaultBackedGate(createMemoryPhiVault()))
    installPhiConfirmer(null)
    const executor = new AcpProviderPromptExecutor({
      backendGeneration: {
        openCodeUsageApi: () => undefined,
        current: { adapter: { nativeMcpEnabled: true, bridgeMcpAliasesEnabled: false } }
      }
    })
    const { input, prompt } = promptInput('担当医：日向 大輔\nCRP 2.4')
    try {
      await executor.execute(input)
      expect(prompt).toHaveBeenCalled()
      const sent = String(prompt.mock.calls[0]?.[0])
      expect(sent).toContain('CRP 2.4')
    } finally {
      installMachineApproval(null)
      installPhiGate({
        release: (value) => ({ text: value, replacements: [], warnings: [] }),
        restore: (value) => value
      })
    }
  })

  it('de-identifies and sends after the machine is approved', async () => {
    const path = logPath()
    await ensureMachineApprovalDeclaration(path, englishNativeTranslator, async () => ({
      approved: true,
      approvalNumber: 'HP-2026-014'
    }))
    const log = createMachineApprovalLog(path)
    installMachineApproval(() => log.isApproved())
    installPhiGate(createVaultBackedGate(createMemoryPhiVault()))
    installPhiConfirmer(null)
    try {
      const text = await releaseModelText('患者：山田 太郎', 'approved-machine')
      expect(text).not.toContain('山田')
      expect(text).toContain('[患者')
    } finally {
      installMachineApproval(null)
      installPhiGate({
        release: (value) => ({ text: value, replacements: [], warnings: [] }),
        restore: (value) => value
      })
    }
  })
})
