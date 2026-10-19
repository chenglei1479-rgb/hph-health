import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { AcpProviderPromptExecutor } from '../acp/provider-prompt-executor'
import type { ProviderPromptExecutionInput } from '../acp/provider-prompt-executor'
import { fetchProviderRequest } from '../settings/provider-fetch'
import {
  applyManualSpans,
  buildConfirmInstaller,
  parseConfirmDecision,
  previewFromResult
} from './confirm'
import {
  createVaultBackedGate,
  installMachineApproval,
  installPhiConfirmer,
  installPhiGate,
  releaseModelText
} from './gate'
import { createMemoryPhiVault } from './store'

describe('PHI pre-send confirmation', () => {
  it('builds a review page that escapes the de-identified text', () => {
    const preview = previewFromResult('患者：山田', [
      {
        start: 3,
        end: 5,
        category: 'PERSON_NAME',
        original: '山田',
        replacement: '[患者1]',
        shifted: false
      }
    ])
    expect(preview.text).toBe('患者：[患者1]')
    expect(preview.highlights).toEqual([{ start: 3, end: 8, category: 'PERSON_NAME' }])
    const script = buildConfirmInstaller(
      { text: `${preview.text}</script>`, highlights: preview.highlights },
      {
        title: 'Review de-identified text',
        explanation: 'Highlighted text was replaced before sending.',
        confirm: 'Confirm send',
        cancel: 'Cancel',
        mark: 'Mark selection'
      }
    )
    expect(script).toContain('\\u003c/script>')
    expect(script).not.toContain('</script>')
    expect(parseConfirmDecision('PHI_CONFIRM {"confirmed":false}')).toEqual({ confirmed: false })
    expect(
      parseConfirmDecision('PHI_CONFIRM {"confirmed":true,"extraSpans":[{"start":1,"end":2}]}')
    ).toEqual({
      confirmed: true,
      extraSpans: [{ start: 1, end: 2 }]
    })
  })

  it('replaces a manually marked span and restores it from the vault', () => {
    const source = '患者：[患者1] 未検出'
    const start = source.indexOf('未検出')
    const replaced = applyManualSpans(
      source,
      [{ start, end: start + '未検出'.length }],
      (original) => {
        expect(original).toBe('未検出')
        return '[追記1]'
      }
    )
    expect(replaced).toBe('患者：[患者1] [追記1]')
    expect(() => applyManualSpans('abc', [{ start: 2, end: 1 }], () => '[追記1]')).toThrow(
      /marked span/
    )
  })

  it('fails closed when the review is dismissed and does not call the model', async () => {
    installMachineApproval(() => true)
    installPhiGate(createVaultBackedGate(createMemoryPhiVault()))
    installPhiConfirmer(async () => ({ confirmed: false }))
    const prompt = vi.fn(async () => ({ stopReason: 'end_turn' }))
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'))
    const executor = new AcpProviderPromptExecutor({
      backendGeneration: {
        openCodeUsageApi: () => undefined,
        current: { adapter: { nativeMcpEnabled: true, bridgeMcpAliasesEnabled: false } }
      }
    })
    const input = {
      session: {
        sessionId: 'phi-confirm',
        prompt,
        nextUpdate: async () => ({ kind: 'stop', response: { stopReason: 'end_turn' } })
      },
      content: '患者：山田 太郎',
      cwd: '/tmp/phi-confirm',
      frameworkId: 'claude-code',
      isCurrent: () => true,
      beforeDispatch: async () => 'active' as const,
      captureStop: () => true,
      onAccepted: () => undefined,
      routeNotification: () => undefined
    } as unknown as ProviderPromptExecutionInput
    try {
      await expect(executor.execute(input)).rejects.toThrow(/dismissed/)
      expect(prompt).not.toHaveBeenCalled()
      await expect(
        fetchProviderRequest(fetchImpl, 'https://gateway.invalid/v1/messages', {
          method: 'POST',
          body: JSON.stringify({ messages: [{ content: '患者：山田 太郎' }] })
        })
      ).rejects.toThrow(/dismissed/)
      expect(fetchImpl).not.toHaveBeenCalled()
    } finally {
      installPhiConfirmer(null)
      installMachineApproval(null)
      installPhiGate({
        release: (text) => ({ text, replacements: [], warnings: [] }),
        restore: (text) => text
      })
    }
  })

  it('sends only after confirmation and redacts a span the user marked', async () => {
    const vault = createMemoryPhiVault()
    installMachineApproval(() => true)
    installPhiGate(createVaultBackedGate(vault))
    installPhiConfirmer(async (preview) => {
      expect(preview.text).not.toContain('山田')
      expect(preview.highlights.length).toBeGreaterThan(0)
      const start = preview.text.indexOf('未検出')
      return { confirmed: true, extraSpans: [{ start, end: start + '未検出'.length }] }
    })
    const prompt = vi.fn<(content: Array<{ text: string }>) => Promise<{ stopReason: string }>>(
      async () => ({ stopReason: 'end_turn' })
    )
    const executor = new AcpProviderPromptExecutor({
      backendGeneration: {
        openCodeUsageApi: () => undefined,
        current: { adapter: { nativeMcpEnabled: true, bridgeMcpAliasesEnabled: false } }
      }
    })
    try {
      await executor.execute({
        session: {
          sessionId: 'phi-mark',
          prompt,
          nextUpdate: async () => ({ kind: 'stop', response: { stopReason: 'end_turn' } })
        },
        content: [{ type: 'text', text: '所見に未検出と記載。患者：山田 太郎' }],
        cwd: '/tmp/phi-mark',
        frameworkId: 'claude-code',
        isCurrent: () => true,
        beforeDispatch: async () => 'active' as const,
        captureStop: () => true,
        onAccepted: () => undefined,
        routeNotification: () => undefined
      } as unknown as ProviderPromptExecutionInput)
      const sent = prompt.mock.calls[0]?.[0] as Array<{ text: string }>
      expect(sent[0].text).not.toContain('未検出')
      expect(sent[0].text).not.toContain('山田')
      expect(sent[0].text).toContain('[追記1]')
      expect(vault.store('/tmp/phi-mark').restore(sent[0].text)).toContain('未検出')
      expect(vault.store('/tmp/phi-mark').restore(sent[0].text)).toContain('山田')
    } finally {
      installPhiConfirmer(null)
      installMachineApproval(null)
      installPhiGate({
        release: (text) => ({ text, replacements: [], warnings: [] }),
        restore: (text) => text
      })
    }
  })

  it('asks for confirmation from the desktop startup path', () => {
    const source = readFileSync(join(__dirname, '../index.ts'), 'utf8')
    const translateAt = source.indexOf('const translate = localeOwner.t.bind(localeOwner)')
    const confirmAt = source.indexOf('installPhiConfirmer(createElectronPhiConfirmer(translate))')
    const approvalAt = source.indexOf('ensureMachineApprovalDeclaration(')
    expect(translateAt).toBeGreaterThan(-1)
    expect(confirmAt).toBeGreaterThan(translateAt)
    expect(approvalAt).toBeGreaterThan(translateAt)
  })

  it('still redacts when no confirmer is installed', async () => {
    installPhiConfirmer(null)
    installMachineApproval(() => true)
    installPhiGate(createVaultBackedGate(createMemoryPhiVault()))
    const text = await releaseModelText('患者：山田 太郎', 'no-ui')
    expect(text).not.toContain('山田')
    installMachineApproval(null)
    installPhiGate({
      release: (value) => ({ text: value, replacements: [], warnings: [] }),
      restore: (value) => value
    })
  })
})
