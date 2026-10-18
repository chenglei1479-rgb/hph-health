import { describe, expect, it, vi } from 'vitest'

import { AcpProviderPromptExecutor } from '../acp/provider-prompt-executor'
import type { ProviderPromptExecutionInput } from '../acp/provider-prompt-executor'
import { fetchProviderRequest } from '../settings/provider-fetch'
import { createClosedGate, installMachineApproval, installPhiGate, releaseModelText } from './gate'

describe('PHI hard gate', () => {
  it('fails closed before a provider session prompt', async () => {
    installMachineApproval(() => true)
    installPhiGate(createClosedGate('blocked'))
    const prompt = vi.fn(async () => ({ stopReason: 'end_turn' }))
    const executor = new AcpProviderPromptExecutor({
      backendGeneration: {
        openCodeUsageApi: () => undefined,
        current: { adapter: { nativeMcpEnabled: true, bridgeMcpAliasesEnabled: false } }
      }
    })
    const input = {
      session: {
        sessionId: 'phi-test',
        prompt,
        nextUpdate: async () => ({ kind: 'stop', response: { stopReason: 'end_turn' } })
      },
      content: '患者：山田 太郎',
      cwd: '/tmp/phi-project',
      frameworkId: 'claude-code',
      isCurrent: () => true,
      beforeDispatch: async () => 'active' as const,
      captureStop: () => true,
      onAccepted: () => undefined,
      routeNotification: () => undefined
    } as unknown as ProviderPromptExecutionInput
    try {
      await expect(executor.execute(input)).rejects.toThrow(/privacy check/)
      expect(prompt).not.toHaveBeenCalled()
    } finally {
      installMachineApproval(null)
      installPhiGate({
        release: (text) => ({ text, replacements: [], warnings: [] }),
        restore: (text) => text
      })
    }
  })

  it('fails closed before a provider HTTP request', async () => {
    installMachineApproval(() => true)
    installPhiGate(createClosedGate('blocked'))
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'))
    try {
      await expect(
        fetchProviderRequest(fetchImpl, 'https://gateway.invalid/v1/messages', {
          method: 'POST',
          body: JSON.stringify({ messages: [{ role: 'user', content: '患者：山田 太郎' }] })
        })
      ).rejects.toThrow(/privacy check/)
      expect(fetchImpl).not.toHaveBeenCalled()
    } finally {
      installMachineApproval(null)
      installPhiGate({
        release: (text) => ({ text, replacements: [], warnings: [] }),
        restore: (text) => text
      })
    }
  })

  it('redacts patient text that would otherwise be sent', async () => {
    installMachineApproval(() => true)
    installPhiGate({
      release: (text) => ({
        text: text.replaceAll('山田 太郎', '[患者1]'),
        replacements: [],
        warnings: []
      }),
      restore: (text) => text.replaceAll('[患者1]', '山田 太郎')
    })
    await expect(releaseModelText('患者：山田 太郎', 'cwd')).resolves.toBe('患者：[患者1]')
    installMachineApproval(null)
    installPhiGate({
      release: (text) => ({ text, replacements: [], warnings: [] }),
      restore: (text) => text
    })
  })
})
