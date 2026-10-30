import { describe, expect, it, vi } from 'vitest'

import { PHI_BLOCK_CODE } from '../../shared/phi-block'
import { AcpProviderPromptExecutor } from '../acp/provider-prompt-executor'
import type { ProviderPromptExecutionInput } from '../acp/provider-prompt-executor'
import { fetchProviderRequest } from '../settings/provider-fetch'
import {
  blockedSpanDiagnostics,
  createClosedGate,
  installMachineApproval,
  installPhiGate,
  MODEL_RELEASE_RETRY_MESSAGE,
  releaseModelText
} from './gate'

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

describe('PHI gate scan scope', () => {
  const installIdentityGate = (): void => {
    installPhiGate({
      release: (text) => ({ text, replacements: [], warnings: [] }),
      restore: (text) => text
    })
  }

  // Shape reported by the beta.18 acceptance run: the Codex bridge sends tool schemas, an instructions
  // block that names today's date, and request ids next to the conversation input.
  const codexBody = (input: unknown): string =>
    JSON.stringify({
      model: 'gpt-6.1-sol',
      instructions:
        'Today is 2026-10-26. MCP server name. Omit to list resources from every configured server.',
      tools: [
        {
          type: 'function',
          name: 'files.read',
          description: 'MCP server name. Omit to list resources from every configured server.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Local filesystem path to an image file.' }
            }
          }
        }
      ],
      prompt_cache_key: '1b1c-7352-92',
      metadata: { user_id: '1b1c-7352-92' },
      input
    })

  it('names the structural field of a blocked hit and never its text', () => {
    const diagnostics = blockedSpanDiagnostics({
      model: 'gpt-6.1-sol',
      instructions: 'Today is 2026-10-26.',
      tools: [{ type: 'function', name: 'files.read', parameters: { type: 'object' } }],
      prompt_cache_key: '1b1c-7352-92',
      metadata: { user_id: '1b1c-7352-92' },
      system: 'Today is 2026-10-26.',
      input: [
        { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'こんにちは' }] },
        { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Hello.' }] }
      ]
    })

    // `instructions` and `tools` are not scanned for blocking, so only the system date is reported.
    expect(diagnostics).toEqual([{ category: 'DATE', offset: 9, length: 10, field: 'system' }])
    const serialized = JSON.stringify(diagnostics)
    expect(serialized).not.toContain('2026-10-26')
    expect(serialized).not.toContain('こんにちは')
  })

  it('points at the array element that carried the hit', () => {
    const diagnostics = blockedSpanDiagnostics({
      input: [
        { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'こんにちは' }] },
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: '受診日は 2026-10-26 です。' }]
        }
      ]
    })

    expect(
      diagnostics.some(
        (hit) => hit.category === 'DATE' && hit.field === 'input[1].content[0].text'
      )
    ).toBe(true)
    expect(JSON.stringify(diagnostics)).not.toContain('2026-10-26')
  })

  it('never writes a data-derived key name into the diagnostic path', () => {
    // `messages[i].content[j].input` is model-generated JSON: its keys can be copied from the
    // conversation, so a hit under one of them must not put that key into the log.
    const diagnostics = blockedSpanDiagnostics({
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              name: 'lookup',
              input: {
                '患者氏名別': { note: '受診日は 2026-10-26 です。' },
                '<script>': '2026-10-26'
              }
            }
          ]
        }
      ]
    })

    const hit = diagnostics.find((entry) => entry.category === 'DATE')
    expect(hit?.field).toContain('[key]')
    const serialized = JSON.stringify(diagnostics)
    expect(serialized).not.toContain('患者氏名別')
    expect(serialized).not.toContain('<script>')
    expect(serialized).not.toContain('2026-10-26')
    // ASCII provider keys still read as structure.
    expect(serialized).toContain('messages[0].content[0].input')
  })

  it('releases a greeting whose only PHI-shaped text is application scaffolding', async () => {
    installMachineApproval(() => false)
    installIdentityGate()
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'))
    const body = codexBody([
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'こんにちは' }] }
    ])
    try {
      await fetchProviderRequest(fetchImpl, 'https://gateway.invalid/v1/responses', {
        method: 'POST',
        body
      })
      expect(fetchImpl).toHaveBeenCalledOnce()
      const sent = JSON.parse((fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string)
      expect(sent).toEqual(JSON.parse(body))
    } finally {
      installMachineApproval(null)
      installIdentityGate()
    }
  })

  it('still blocks patient information inside the conversation input', async () => {
    installMachineApproval(() => false)
    installIdentityGate()
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'))
    const body = codexBody([
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: '患者：山田 太郎' }]
      }
    ])
    try {
      const error = await fetchProviderRequest(fetchImpl, 'https://gateway.invalid/v1/responses', {
        method: 'POST',
        body
      }).catch((cause: unknown) => cause)
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toContain(PHI_BLOCK_CODE)
      expect((error as Error).message).not.toContain('山田')
      expect(fetchImpl).not.toHaveBeenCalled()
    } finally {
      installMachineApproval(null)
      installIdentityGate()
    }
  })

  it('still blocks patient information inside a tool output', async () => {
    installMachineApproval(() => false)
    installIdentityGate()
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'))
    const body = codexBody([
      {
        type: 'function_call_output',
        call_id: '1b1c-7352-92',
        output: '患者：山田 太郎'
      }
    ])
    try {
      await expect(
        fetchProviderRequest(fetchImpl, 'https://gateway.invalid/v1/responses', {
          method: 'POST',
          body
        })
      ).rejects.toThrow(PHI_BLOCK_CODE)
      expect(fetchImpl).not.toHaveBeenCalled()
    } finally {
      installMachineApproval(null)
      installIdentityGate()
    }
  })

  it('passes tool schema, tool choice, metadata and identifier keys through untouched', async () => {
    installMachineApproval(() => false)
    // Marks the conversation text, so a field the release projection visited would show the mark.
    installPhiGate({
      release: (text) =>
        text.includes('こんにちは')
          ? { text: 'hello', replacements: [], warnings: [] }
          : { text, replacements: [], warnings: [] },
      restore: (text) => text
    })
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'))
    // Patient text parked in the scaffolding fields pins the documented boundary: those fields are
    // neither blocked nor released, which is why the app must never write user or project text there.
    const body = JSON.stringify({
      model: 'gpt-6.1-sol',
      instructions: 'Follow the hospital style guide.',
      tools: [{ type: 'function', name: 'files.read', description: '患者：山田 太郎' }],
      tool_choice: { type: 'function', name: 'files.read', note: '患者：山田 太郎' },
      metadata: { user_id: '患者：山田 太郎' },
      prompt_cache_key: '患者：山田 太郎',
      input: [
        { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'こんにちは' }] }
      ]
    })
    try {
      await fetchProviderRequest(fetchImpl, 'https://gateway.invalid/v1/responses', {
        method: 'POST',
        body
      })
      const sent = JSON.parse((fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string)
      const original = JSON.parse(body)
      expect(sent.tools).toEqual(original.tools)
      expect(sent.tool_choice).toEqual(original.tool_choice)
      expect(sent.metadata).toEqual(original.metadata)
      expect(sent.prompt_cache_key).toBe('患者：山田 太郎')
      // The content projection still released the conversation and the instructions block.
      expect(sent.input[0].content[0].text).toBe('hello')
      expect(sent.instructions).toBe('Follow the hospital style guide.')
    } finally {
      installMachineApproval(null)
      installIdentityGate()
    }
  })

  it('refuses to send when two keys de-identify to the same replacement', async () => {
    installMachineApproval(() => false)
    installPhiGate({
      release: (text) =>
        text.includes('山田')
          ? { text: '[[患者]]', replacements: [], warnings: [] }
          : { text, replacements: [], warnings: [] },
      restore: (text) => text
    })
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'))
    const body = JSON.stringify({ '患者A 山田 太郎': 1, '患者B 山田 太郎': 2 })
    try {
      await expect(
        fetchProviderRequest(fetchImpl, 'https://gateway.invalid/v1/responses', {
          method: 'POST',
          body
        })
      ).rejects.toThrow(MODEL_RELEASE_RETRY_MESSAGE)
      expect(fetchImpl).not.toHaveBeenCalled()
    } finally {
      installMachineApproval(null)
      installIdentityGate()
    }
  })
})
