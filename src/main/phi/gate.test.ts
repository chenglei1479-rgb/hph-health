import { describe, expect, it, vi } from 'vitest'

import { AcpProviderPromptExecutor } from '../acp/provider-prompt-executor'
import type { ProviderPromptExecutionInput } from '../acp/provider-prompt-executor'
import { fetchProviderRequest } from '../settings/provider-fetch'
import { createClosedGate, installPhiGate, releaseModelText } from './gate'

describe('PHI hard gate', () => {
  it('fails closed before a provider session prompt', async () => {
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
      await expect(executor.execute(input)).rejects.toThrow(/blocked|PHI/)
      expect(prompt).not.toHaveBeenCalled()
    } finally {
      installPhiGate({
        release: (text) => ({ text, replacements: [], warnings: [] }),
        restore: (text) => text
      })
    }
  })

  it('fails closed before a provider HTTP request', async () => {
    installPhiGate(createClosedGate('blocked'))
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'))
    try {
      await expect(
        fetchProviderRequest(fetchImpl, 'https://gateway.invalid/v1/messages', {
          method: 'POST',
          body: JSON.stringify({ messages: [{ role: 'user', content: '患者：山田 太郎' }] })
        })
      ).rejects.toThrow(/blocked|PHI/)
      expect(fetchImpl).not.toHaveBeenCalled()
    } finally {
      installPhiGate({
        release: (text) => ({ text, replacements: [], warnings: [] }),
        restore: (text) => text
      })
    }
  })

  it('redacts patient text that would otherwise be sent', () => {
    installPhiGate({
      release: (text) => ({
        text: text.replaceAll('山田 太郎', '[患者1]'),
        replacements: [],
        warnings: []
      }),
      restore: (text) => text.replaceAll('[患者1]', '山田 太郎')
    })
    expect(releaseModelText('患者：山田 太郎', 'cwd')).toBe('患者：[患者1]')
    installPhiGate({
      release: (text) => ({ text, replacements: [], warnings: [] }),
      restore: (text) => text
    })
  })
})
