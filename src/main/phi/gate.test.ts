import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { flushLogs, initLogger } from '@aipoch/diagnostics/node'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  PHI_BLOCK_CODE,
  PHI_INTERNAL_CODE,
  PHI_UNAVAILABLE_CODE,
  PhiPolicyError
} from '../../shared/phi-block'
import { AcpProviderPromptExecutor } from '../acp/provider-prompt-executor'
import type { ProviderPromptExecutionInput } from '../acp/provider-prompt-executor'
import { fetchProviderRequest } from '../settings/provider-fetch'
import {
  blockedSpanDiagnostics,
  createClosedGate,
  createVaultBackedGate,
  installMachineApproval,
  installPhiConfirmer,
  installPhiGate,
  MODEL_RELEASE_RETRY_MESSAGE,
  PHI_INTERNAL_MESSAGE,
  refuseConnectorQueryArgs,
  refusePatientQuery,
  releaseModelText,
  restoredBlockedSpanDiagnostics
} from './gate'
import { createMemoryPhiVault } from './store'
import { deidentify } from './deidentify'

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

  // #131, on the real path rather than a reconstructed string. The beta.20 incident was a writing
  // request whose `write_artifact_file` arguments carried a chart's age-stratum labels; the gate read
  // `Age 18` as a date and blocked the send twelve times. This body mirrors that payload (thirteen
  // `input` entries, the tool call last) so the shape is the production one, not a guess.
  it('sends a writing request whose age band labels are groups, not dates (#131)', async () => {
    installMachineApproval(null)
    installPhiGate(createVaultBackedGate(createMemoryPhiVault()))
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'))
    const toolArguments = JSON.stringify({
      path: 'age_strata.py',
      content:
        "labels = ['Age 18-39', 'Age 40–64', 'Age 65~79', 'Age 80+', 'Age 80 and over']\n" +
        'ax.set_xticklabels(labels)'
    })
    const writingBody = JSON.stringify({
      model: 'codex',
      input: [
        ...Array.from({ length: 12 }, (_, index) => ({
          type: 'message',
          role: 'user',
          content: `step ${index}`
        })),
        { type: 'function_call', name: 'write_artifact_file', arguments: toolArguments }
      ]
    })
    try {
      await fetchProviderRequest(fetchImpl, 'https://gateway.invalid/v1/responses', {
        method: 'POST',
        body: writingBody
      })
      expect(fetchImpl).toHaveBeenCalledOnce()
      // The labels reach the provider intact: no masking, because there was nothing to mask.
      expect(String(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body)).toContain('Age 18-39')
      // Both spellings of the open end take the same path — the word form is not a separate rule.
      expect(String(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body)).toContain('Age 80 and over')

      // The other half of the pair: the same request shape carrying one person's age is still held,
      // and the block names the stable code the incident log carried.
      const singleAge = writingBody.replace('Age 18-39', 'Age 72')
      await expect(
        fetchProviderRequest(fetchImpl, 'https://gateway.invalid/v1/responses', {
          method: 'POST',
          body: singleAge
        })
      ).rejects.toThrow(new RegExp(PHI_BLOCK_CODE))
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
    const hit = diagnostics[0]
    // The payload is a closed set: adding a text field here would put patient information on disk.
    expect(Object.keys(hit).sort()).toEqual([
      'category',
      'field',
      'length',
      'offset',
      'pass',
      'rule',
      'textDigest8',
      'textLength'
    ])
    expect(hit).toMatchObject({
      category: 'DATE',
      offset: 9,
      length: 10,
      field: 'system',
      pass: 'blocked',
      textLength: 'Today is 2026-10-26.'.length
    })
    // The date patterns carry a rule id, so the log names the pattern and not just the offset.
    expect(hit.rule).toBe('date-bare-iso')
    // A hash prefix, never the first characters of the scanned string.
    expect(hit.textDigest8).toMatch(/^[0-9a-f]{8}$/u)
    expect('Today is 2026-10-26.').not.toContain(hit.textDigest8)
    const serialized = JSON.stringify(diagnostics)
    expect(serialized).not.toContain('2026-10-26')
    expect(serialized).not.toContain('こんにちは')
  })

  it('names the rule that fired and hashes the scanned string, not the match', () => {
    const body = {
      input: [
        {
          type: 'function_call_output',
          output: [{ type: 'input_text', text: '保険者番号 02123456' }]
        }
      ]
    }
    const [first] = blockedSpanDiagnostics(body)
    const [second] = blockedSpanDiagnostics(body)
    expect(first).toMatchObject({
      category: 'INSURER_NO',
      offset: 6,
      length: 8,
      field: 'input[0].output[0].text',
      pass: 'blocked',
      rule: 'insurer-no-labeled-digits'
    })
    expect(first.textDigest8).toBe(second.textDigest8)
    expect(JSON.stringify(first)).not.toContain('02123456')
  })

  it('labels the restore-before-send pass, whose offsets belong to the restored text', () => {
    // The two passes scan different strings: the released body carries a vault mark where the restored
    // text carries the name, so the same offset means different things and only `pass` tells them apart.
    const body = {
      input: [{ type: 'message', content: [{ type: 'input_text', text: '[患者1]' }] }]
    }
    expect(blockedSpanDiagnostics(body)).toEqual([])
    const [restored] = restoredBlockedSpanDiagnostics(body, () => '山田 太郎')
    expect(restored).toMatchObject({
      category: 'PERSON_NAME',
      field: 'input[0].content[0].text',
      pass: 'restored',
      offset: 0,
      length: 5,
      textLength: 5
    })
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
      diagnostics.some((hit) => hit.category === 'DATE' && hit.field === 'input[1].content[0].text')
    ).toBe(true)
    expect(JSON.stringify(diagnostics)).not.toContain('2026-10-26')
  })

  // #264: beta.23 blocked a writing turn with three hits, one of them an INSURED_ID read out of a
  // reasoning item's `encrypted_content`. That value is ciphertext, not text: the same conversation
  // re-encrypts to different bytes, so a hit inside it moves with every turn and no reader can see
  // patient information in it. The fragment below is the production shape — a base64url token whose
  // `xxx-1234-56` run is what the unlabeled insured-id pattern reads (that rule records no id).
  const opaqueToken = `aB3dEf9z-1234-56${'kQ7'.repeat(7)}9A`

  it('does not scan an opaque provider token, and still blocks the same shape in text (#264)', () => {
    expect(
      blockedSpanDiagnostics({ input: [{ type: 'reasoning', encrypted_content: opaqueToken }] })
    ).toEqual([])
    expect(
      blockedSpanDiagnostics({
        messages: [
          { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: opaqueToken }] }
        ]
      })
    ).toEqual([])
    // The exemption is the field, not the pattern: the same bytes typed into content still block.
    const [hit] = blockedSpanDiagnostics({
      input: [
        { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'aB3dEf9z-1234-56' }] }
      ]
    })
    expect(hit).toMatchObject({
      category: 'INSURED_ID',
      offset: 0,
      length: 16,
      field: 'input[0].content[0].text'
    })
    expect(hit?.rule).toBeUndefined()
  })

  it('sends an opaque provider token back byte for byte (#264)', async () => {
    installMachineApproval(() => true)
    // Marks every released string that carries the token fragment, so a field the release projection
    // visited at all would come back as the mark instead of the ciphertext.
    installPhiGate({
      release: (text) =>
        text.includes('aB3dEf9z-1234-56')
          ? { text: '[遮蔽]', replacements: [], warnings: [] }
          : { text, replacements: [], warnings: [] },
      restore: (text) => text
    })
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'))
    const bodies = [
      {
        model: 'gpt-6.1-sol',
        input: [
          { type: 'reasoning', encrypted_content: opaqueToken },
          {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: '元のメモ aB3dEf9z-1234-56' }]
          }
        ]
      },
      {
        model: 'gpt-6.1-sol',
        messages: [
          { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: opaqueToken }] }
        ]
      }
    ]
    try {
      for (const body of bodies) {
        await fetchProviderRequest(fetchImpl, 'https://gateway.invalid/v1/responses', {
          method: 'POST',
          body: JSON.stringify(body)
        })
      }
      const sent = fetchImpl.mock.calls.map(
        (call) => JSON.parse((call[1] as RequestInit).body as string) as Record<string, any>
      )
      // Rewriting a provider's own token voids the reasoning state it checks on the way back.
      expect(sent[0]?.input[0].encrypted_content).toBe(opaqueToken)
      expect(sent[1]?.messages[0].content[0].signature).toBe(opaqueToken)
      // The text next to it was still released, so the skip did not disable the projection.
      expect(sent[0]?.input[1].content[0].text).toBe('[遮蔽]')
    } finally {
      installMachineApproval(null)
      installIdentityGate()
    }
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
                患者氏名別: { note: '受診日は 2026-10-26 です。' },
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
      // #195: a pseudonymization collision is our own invariant breaking (E), not patient
      // information the doctor sent (A) and not a temporary engine failure (C1). The old expectation
      // here was the C1 retry sentence, which invited a retry that could never help.
      await expect(
        fetchProviderRequest(fetchImpl, 'https://gateway.invalid/v1/responses', {
          method: 'POST',
          body
        })
      ).rejects.toMatchObject({ message: PHI_INTERNAL_MESSAGE, code: PHI_INTERNAL_CODE })
      expect(PHI_INTERNAL_MESSAGE).not.toBe(MODEL_RELEASE_RETRY_MESSAGE)
      expect(fetchImpl).not.toHaveBeenCalled()
    } finally {
      installMachineApproval(null)
      installIdentityGate()
    }
  })
})

// #159: a public literature query in a patient project died with PHI-BLOCK-01 behind a 502. The hit was
// inside `client_metadata`, the Codex CLI's own transport envelope: a generated id fragment and a dated
// workspace path, never the doctor's question. The envelope is skipped for blocking, but it stays in the
// release projection, so anything patient-shaped parked there is still masked before the body is sent.
describe('third-party transport envelope (#159)', () => {
  const installIdentityGate = (): void => {
    installPhiGate({
      release: (text) => ({ text, replacements: [], warnings: [] }),
      restore: (text) => text
    })
  }

  // Keys, order and value shapes captured from a real request of the managed CLI (codex-cli 0.157.1).
  // Only the machine-specific values are replaced; the dated workspace path is kept because it is what
  // the detector used to flag (`DATE / date-bare-iso`, offset 667 of a 961-character value).
  const codexEnvelope = (workspacePath = 'C:\\work\\2026-11-06\\hph-health'): string =>
    JSON.stringify({
      'x-codex-turn-metadata': JSON.stringify({
        installation_id: '213de936-fdcb-4bc6-9de0-62bff721273a',
        session_id: '01a1b1c7-a3ac-7c03-b767-e93bda2db4a3',
        thread_id: '01a1b1c7-a3ac-7c03-b767-e93bda2db4a3',
        agent_name: '/root',
        turn_id: '01a1b1c7-a441-74f2-8c51-c9837b468a66',
        window_id: '01a1b1c7-a3ac-7c03-b767-e93bda2db4a3:0',
        window_number: 0,
        context_window_id: '01a1b1c7-a3ac-7c03-b767-e94d678d308a',
        request_kind: 'turn',
        root_turn_id: '01a1b1c7-a441-74f2-8c51-c9837b468a66',
        thread_source: 'user',
        turn_trigger: 'exec',
        sandbox: 'none',
        sandbox_mode: 'read-only',
        auto_review_enabled: false,
        node_repl_auto_review_required: false,
        node_repl_disabled: false,
        workspaces: { [workspacePath]: { has_changes: false } },
        turn_started_at_unix_ms: 1793984013388,
        analytics_enabled: true,
        model: 'gpt-5'
      }),
      'x-codex-window-id': '01a1b1c7-a3ac-7c03-b767-e93bda2db4a3:0',
      thread_id: '01a1b1c7-a3ac-7c03-b767-e93bda2db4a3',
      'x-codex-installation-id': '213de936-fdcb-4bc6-9de0-62bff721273a',
      session_id: '01a1b1c7-a3ac-7c03-b767-e93bda2db4a3',
      root_turn_id: '01a1b1c7-a441-74f2-8c51-c9837b468a66',
      turn_id: '01a1b1c7-a441-74f2-8c51-c9837b468a66'
    })

  const literatureBody = (text: string, workspacePath?: string): string =>
    JSON.stringify({
      model: 'gpt-5',
      instructions: 'Follow the hospital style guide.',
      input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text }] }],
      tools: [],
      tool_choice: 'auto',
      parallel_tool_calls: true,
      reasoning: { effort: 'none', summary: 'auto' },
      store: false,
      stream: true,
      include: [],
      prompt_cache_key: '1b1c-7352-92',
      client_metadata: JSON.parse(codexEnvelope(workspacePath))
    })

  const query =
    'PubMedで STROBE observational studies reporting guideline 2007 を検索し、J-STAGEで「再入院」を検索してください。'

  it('sends a clean literature query from a patient project', async () => {
    installMachineApproval(null)
    installPhiGate(createVaultBackedGate(createMemoryPhiVault()))
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'))
    try {
      await fetchProviderRequest(fetchImpl, 'https://gateway.invalid/v1/responses', {
        method: 'POST',
        body: literatureBody(query)
      })
      expect(fetchImpl).toHaveBeenCalledOnce()
      const sent = JSON.parse((fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string)
      // The envelope is not stripped: the CLI's protocol field keeps its place in the body.
      expect(Object.keys(sent.client_metadata)).toContain('x-codex-turn-metadata')
      expect(sent.input[0].content[0].text).toBe(query)
    } finally {
      installMachineApproval(null)
      installIdentityGate()
    }
  })

  it('still blocks patient information in the conversation', async () => {
    installMachineApproval(null)
    installPhiGate(createVaultBackedGate(createMemoryPhiVault()))
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'))
    try {
      await expect(
        fetchProviderRequest(fetchImpl, 'https://gateway.invalid/v1/responses', {
          method: 'POST',
          body: literatureBody('患者：山田 太郎、保険者番号 02123456 の再入院を調べてください。')
        })
      ).rejects.toThrow(PHI_BLOCK_CODE)
      expect(fetchImpl).not.toHaveBeenCalled()
    } finally {
      installMachineApproval(null)
      installIdentityGate()
    }
  })

  // The precondition for skipping the envelope when blocking: it is still released. This asserts the
  // bytes handed to fetch, not the de-identification return value, because only the sent body matters.
  it('masks patient information that sits inside the envelope', async () => {
    installMachineApproval(null)
    installPhiGate(createVaultBackedGate(createMemoryPhiVault()))
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'))
    const patientPath = 'C:\\clinic\\保険者番号 02123456\\2026-11-06'
    try {
      await fetchProviderRequest(fetchImpl, 'https://gateway.invalid/v1/responses', {
        method: 'POST',
        body: literatureBody(query, patientPath)
      })
      expect(fetchImpl).toHaveBeenCalledOnce()
      const sentBody = (fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string
      // Not blocked, but the identifier never reaches the provider: the release pass rewrote the field.
      expect(sentBody).not.toContain('02123456')
      const sent = JSON.parse(sentBody)
      const metadata = JSON.parse(sent.client_metadata['x-codex-turn-metadata'])
      const [workspace] = Object.keys(metadata.workspaces)
      expect(workspace).not.toContain('02123456')
      expect(workspace).toContain('番号')
    } finally {
      installMachineApproval(null)
      installIdentityGate()
    }
  })
})

// #244: the gate was firing on machine-generated tool traffic — a bare ISO date in a function call's
// arguments refused the whole turn (session #28), and an agent bookkeeping id inside
// `x-codex-turn-metadata` was rewritten into an insurance-number placeholder. Both are the same
// asymmetry #194 fixed for blocking: the field decides, and only the machine-generated field is
// exempt. The DATE rule itself is untouched, so the same date in text the researcher typed still
// blocks (#131).
describe('machine-generated tool traffic (#244)', () => {
  const isoDate = '2026-10-13'

  const installIdentityGate = (): void => {
    installMachineApproval(null)
    installPhiGate({
      release: (text) => ({ text, replacements: [], warnings: [] }),
      restore: (text) => text
    })
  }

  const machineBody = (text = 'Summarise the notes in this folder.'): string =>
    JSON.stringify({
      model: 'gpt-6.1-sol',
      input: [
        { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
        {
          type: 'function_call',
          name: 'list_files',
          arguments: JSON.stringify({ path: 'notes', since: isoDate })
        },
        {
          type: 'function_call_output',
          call_id: 'call_1',
          output: JSON.stringify({ checked_at: isoDate })
        }
      ]
    })

  it('does not block a bare ISO date inside a tool call argument or a tool output', async () => {
    installMachineApproval(null)
    installPhiGate(createVaultBackedGate(createMemoryPhiVault()))
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'))
    const body = machineBody()
    try {
      const diagnostics = blockedSpanDiagnostics(JSON.parse(body))
      expect(diagnostics.filter((item) => item.category === 'DATE')).toEqual([])
      await fetchProviderRequest(fetchImpl, 'https://gateway.invalid/v1/responses', {
        method: 'POST',
        body
      })
      expect(fetchImpl).toHaveBeenCalledOnce()
    } finally {
      installIdentityGate()
    }
  })

  it('still blocks a bare ISO date in the text the researcher typed', async () => {
    installMachineApproval(null)
    installPhiGate(createVaultBackedGate(createMemoryPhiVault()))
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'))
    const body = machineBody(`退院日は ${isoDate} です。`)
    try {
      expect(blockedSpanDiagnostics(JSON.parse(body)).map((item) => item.rule)).toEqual([
        'date-bare-iso'
      ])
      await expect(
        fetchProviderRequest(fetchImpl, 'https://gateway.invalid/v1/responses', {
          method: 'POST',
          body
        })
      ).rejects.toMatchObject({ code: PHI_BLOCK_CODE })
      expect(fetchImpl).not.toHaveBeenCalled()
    } finally {
      installIdentityGate()
    }
  })

  it('keeps an agent metadata id and still masks a body insurance number', async () => {
    installMachineApproval(() => true)
    installPhiGate(createVaultBackedGate(createMemoryPhiVault()))
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'))
    const metadata = JSON.stringify({
      session_id: '01a1c45b-d421-7cc3-bf94-6dd4329ebd67',
      agent_name: '02852897-1234-56',
      // A labelled identifier inside the same reserved field is still a patient identifier (#159).
      workspaces: { 'C:\\clinic\\被保険者番号 12345678': { has_changes: false } }
    })
    const body = JSON.stringify({
      model: 'gpt-6.1-sol',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: '保険者番号 02123456 の患者の再入院' }]
        }
      ],
      client_metadata: { 'x-codex-turn-metadata': metadata }
    })
    try {
      await fetchProviderRequest(fetchImpl, 'https://gateway.invalid/v1/responses', {
        method: 'POST',
        body
      })
      const sentText = (fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string
      const sent = JSON.parse(sentText)
      expect(JSON.parse(sent.client_metadata['x-codex-turn-metadata']).agent_name).toBe(
        '02852897-1234-56'
      )
      expect(sentText).not.toContain('02123456')
      expect(sentText).not.toContain('12345678')
      // The body number is still replaced; only the agent bookkeeping field is exempt.
      expect(sent.input[0].content[0].text).not.toContain('02123456')
      expect(sent.input[0].content[0].text).toContain('の患者の再入院')
    } finally {
      installIdentityGate()
    }
  })

  // The regression the notebook job caught: adding an optional third argument to release must not
  // change the call shape for the ordinary path. A gate double is compared by call arguments, so an
  // explicit third `undefined` turns an unrelated notebook test red.
  it('keeps the two-argument release call when there are no options', async () => {
    const release = vi.fn((text: string) => ({ text, replacements: [], warnings: [] }))
    installMachineApproval(() => true)
    installPhiGate({ release, restore: (text) => text })
    try {
      await releaseModelText('hello', 'fiction')
      expect(release.mock.calls[0]).toHaveLength(2)
    } finally {
      installIdentityGate()
    }
  })

  // #244 acceptance: the packaged boundary itself must not change the answer. The same body is
  // released through a gate object created by a second module copy (what a separate bundle is:
  // another copy of the classes), and the bytes must be identical.
  it('releases identical bytes through a gate from another module copy', async () => {
    installMachineApproval(() => true)
    const vault = createMemoryPhiVault()
    const body = JSON.stringify({
      model: 'gpt-6.1-sol',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: `退院日は ${isoDate} です。` }]
        }
      ],
      client_metadata: {
        'x-codex-turn-metadata': JSON.stringify({ agent_name: '02852897-1234-56' })
      }
    })
    const run = async (gate: Parameters<typeof installPhiGate>[0]): Promise<string> => {
      installPhiGate(gate)
      const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'))
      await fetchProviderRequest(fetchImpl, 'https://gateway.invalid/v1/responses', {
        method: 'POST',
        body
      })
      return (fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string
    }
    try {
      const local = await run(createVaultBackedGate(vault))
      vi.resetModules()
      const foreign = (await import('./gate')) as typeof import('./gate')
      const bundled = await run(foreign.createVaultBackedGate(vault))
      expect(bundled).toBe(local)
    } finally {
      installIdentityGate()
    }
  })
})

// #252: the beta.23 build refused every turn with PHI-UNAVAILABLE-01 / reason "gate-error" and only the class
// was recorded, so the incident could not be attributed (the same defect as the 502 that dropped
// error.cause, #251). The message can carry a vault path, so the log records stable identifiers only.
describe('release failure diagnostics (#252)', () => {
  let logDir: string

  const installIdentity = (): void => {
    installMachineApproval(null)
    installPhiGate({
      release: (text) => ({ text, replacements: [], warnings: [] }),
      restore: (text) => text
    })
  }

  beforeEach(async () => {
    logDir = await mkdtemp(join(tmpdir(), 'phi-release-log-'))
    initLogger({ logDir, mirrorToConsole: false })
  })

  afterEach(async () => {
    await flushLogs()
    await rm(logDir, { recursive: true, force: true })
    installIdentity()
  })

  const readLog = async (): Promise<string> => {
    await flushLogs()
    return readFile(join(logDir, 'main.log'), 'utf8')
  }

  it('names a filesystem cause without logging the vault path', async () => {
    installMachineApproval(null)
    installPhiGate({
      release: () => {
        throw Object.assign(new Error('EACCES: private vault path C:\\Users\\someone\\vault.bin'), {
          code: 'EACCES'
        })
      },
      restore: (text) => text
    })
    await expect(releaseModelText('hello', 'fiction')).rejects.toMatchObject({
      code: PHI_UNAVAILABLE_CODE
    })
    const log = await readLog()
    expect(log).toContain('phi release unavailable')
    expect(log).toContain('"reason":"gate-error"')
    expect(log).toContain('"errorName":"Error"')
    expect(log).toContain('"errorCode":"EACCES"')
    expect(log).toContain('"isPhiError":false')
    expect(log).toContain('"isVaultPathError":true')
    expect(log).toContain('"hasErrorMessage":true')
    expect(log).not.toContain('private vault path')
    expect(log).not.toContain('someone')
  })

  it('identifies a typed invariant failure by its stable code', async () => {
    installMachineApproval(null)
    installPhiGate({
      release: () => {
        throw new PhiPolicyError('private invariant detail', PHI_INTERNAL_CODE)
      },
      restore: (text) => text
    })
    await expect(releaseModelText('hello', 'fiction')).rejects.toMatchObject({
      code: PHI_INTERNAL_CODE
    })
    const log = await readLog()
    expect(log).toContain('phi release refused by an internal invariant')
    expect(log).toContain('"errorCode":"PHI-INTERNAL-01"')
    expect(log).toContain('"isPhiError":true')
    expect(log).toContain('"isVaultPathError":false')
    expect(log).not.toContain('private invariant detail')
  })
})

// #264: the two shape rules COO scoped to release-only on 2026-11-12 — `date-bare-slash` read `3/4`,
// `guess-segment` read a 7-character segment. Reading "the turn is no longer refused" as "the value is
// no longer masked" would turn a relaxed block into a silent leak, so all three sides are pinned
// together: the released bytes, the blocking count, and the name recall the masking path must keep.
describe('release-only shape rules (#264)', () => {
  const FIXTURE = join(__dirname, '../../../test/fixtures/jp-phi-short-records')
  let logDir: string

  // The real masking path, not a stub: a release projection that returned its input unchanged would
  // make the byte-identity assertions below hold for the wrong reason.
  // A fixed vault key: the date shift is HMAC-derived from it, so the released bytes below can be
  // pinned as literals instead of compared against a second run of the same function.
  const newStore = () => createMemoryPhiVault({ key: Buffer.alloc(32, 7) }).store('release-only')
  const installMaskingGate = (store = newStore()): void => {
    installPhiGate({
      release: (text) => deidentify(text, store),
      restore: (text) => store.restore(text)
    })
  }

  beforeEach(async () => {
    logDir = await mkdtemp(join(tmpdir(), 'phi-release-only-'))
    initLogger({ logDir, mirrorToConsole: false })
  })

  afterEach(async () => {
    await flushLogs()
    await rm(logDir, { recursive: true, force: true })
    installMachineApproval(null)
    installPhiGate({
      release: (text) => ({ text, replacements: [], warnings: [] }),
      restore: (text) => text
    })
  })

  const readLog = async (): Promise<string> => {
    await flushLogs()
    return readFile(join(logDir, 'main.log'), 'utf8')
  }

  it('refuses nothing on the two shape rules and releases the same bytes as before', async () => {
    installMachineApproval(() => false)
    const store = newStore()
    installMaskingGate(store)
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'))
    const body = JSON.stringify({
      model: 'gpt-6.1-sol',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: '受診日は 3/4 です。' }]
        },
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: '研究の分担：佐藤 健' }]
        }
      ]
    })
    await fetchProviderRequest(fetchImpl, 'https://gateway.invalid/v1/responses', {
      method: 'POST',
      body
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
    const sent = JSON.parse((fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string)
    // Byte-identical to the release output before this change: the same shifted date, the same
    // pseudonym. Only the refusal is gone.
    expect(sent.input[0].content[0].text).toBe('受診日は 7/20 です。')
    expect(sent.input[1].content[0].text).toBe('研究の分担：[患者1]')
    expect(JSON.stringify(sent)).not.toContain('3/4')
    expect(JSON.stringify(sent)).not.toContain('佐藤')
    // Blocking count for the two rules: exactly zero.
    expect(blockedSpanDiagnostics(JSON.parse(body))).toEqual([])
    // The downgrade is not a widened PERSON_NAME exemption: a labelled name still blocks.
    expect(
      blockedSpanDiagnostics({
        input: [{ type: 'message', content: [{ type: 'input_text', text: '患者：山田 太郎' }] }]
      }).map((hit) => hit.category)
    ).toEqual(['PERSON_NAME'])
  })

  // `記載日/報告日/文書日付/作成日/研究期間/承認日/同意取得日` name the document, not the patient, so the masking
  // path has always kept them (`deidentify`, `kind === 'document'`). The blocking projection never looked
  // at `kind`, so on main every one of those labels was "not masked but refused" — the refusal was what
  // kept the date out of the request. CTO (2026-11-12): release-only moves exactly one shape, `3/4`, to
  // "sent and still not masked", so the whole label list is exercised here. A date shape that later joins
  // the policy would otherwise widen that state silently, label by label.
  const DOCUMENT_DATE_LABELS = [
    '記載日',
    '報告日',
    '文書日付',
    '作成日',
    '研究期間',
    '承認日',
    '同意取得日'
  ] as const

  it.each(DOCUMENT_DATE_LABELS)(
    'leaves the document date after %s unmasked, and no longer refuses the 3/4 shape',
    async (label) => {
      installMachineApproval(() => false)
      const store = newStore()
      installMaskingGate(store)
      const text = `${label}：3/4`
      expect(deidentify(text, store).text).toBe(text)
      expect(
        blockedSpanDiagnostics({
          input: [{ type: 'message', content: [{ type: 'input_text', text }] }]
        })
      ).toEqual([])
      const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'))
      await fetchProviderRequest(fetchImpl, 'https://gateway.invalid/v1/responses', {
        method: 'POST',
        body: JSON.stringify({
          input: [{ type: 'message', content: [{ type: 'input_text', text }] }]
        })
      })
      expect(fetchImpl).toHaveBeenCalledOnce()
    }
  )

  it('keeps the other date shapes under a document label refused', () => {
    // The downgrade is one shape, not the DATE category: an era date after the same label is still
    // refused (it always was) and still not masked. If this starts passing, release-only grew.
    installMachineApproval(() => false)
    const store = newStore()
    installMaskingGate(store)
    expect(deidentify('作成日：令和8年4月5日', store).text).toBe('作成日：令和8年4月5日')
    expect(
      blockedSpanDiagnostics({
        input: [
          { type: 'message', content: [{ type: 'input_text', text: '作成日：令和8年4月5日' }] }
        ]
      }).map((hit) => hit.rule)
    ).toEqual(['date-bare-era'])
  })

  it('records a downgraded hit with its rule id and no text', async () => {
    installMachineApproval(() => false)
    installMaskingGate()
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'))
    await fetchProviderRequest(fetchImpl, 'https://gateway.invalid/v1/responses', {
      method: 'POST',
      body: JSON.stringify({
        input: [{ type: 'message', content: [{ type: 'input_text', text: '受診日は 3/4 です。' }] }]
      })
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
    const log = await readLog()
    expect(log).toContain('phi release-only hit passed without blocking')
    expect(log).toContain('"rule":"date-bare-slash"')
    // Same payload rule as the block log: where it was and how long, never what it said.
    expect(log).toContain('"field":"input[0].content[0].text"')
    expect(log).not.toContain('3/4')
    // Its own id, never the block id (#266): support greps PHI-BLOCK-01 to answer "did the gate refuse
    // anything?", and a release that borrowed the id would make that count lie.
    expect(log).toContain(`"code":"PHI-RELEASE-ONLY-01"`)
    const downgradeLine =
      log.split('\n').find((line) => line.includes('phi release-only hit passed')) ?? ''
    expect(downgradeLine).not.toContain(PHI_BLOCK_CODE)
  })

  // COO (2026-11-12): release-only is the one new fail-open seam. The connector hard-refuse paths do not
  // mask — they send nothing — so they never consult RELEASE_ONLY_RULES and must keep refusing both
  // shapes. Without these cases, wiring `diagnosticFor` into a connector path would look green.
  it('keeps the connector hard-refuse path strict', () => {
    const refusal = (run: () => void): unknown => {
      try {
        run()
      } catch (error) {
        return error
      }
      return null
    }
    // A bare-slash date is a released model field but still a refused search query.
    expect(refusal(() => refusePatientQuery('3/4'))).toMatchObject({ code: PHI_BLOCK_CODE })
    expect(refusal(() => refuseConnectorQueryArgs({ query: '3/4' }))).toMatchObject({
      code: PHI_BLOCK_CODE
    })
    // A labelled name is not the whole-query guess, so the connector exemption does not cover it.
    expect(refusal(() => refusePatientQuery('患者名: 佐藤'))).toMatchObject({ code: PHI_BLOCK_CODE })
    expect(refusal(() => refuseConnectorQueryArgs({ query: '患者名: 佐藤' }))).toMatchObject({
      code: PHI_BLOCK_CODE
    })
  })

  it('still masks every reviewed short-record name', async () => {
    // The red line is masking recall, not blocking: these are the reviewed names the short-record
    // fixture pins at 1.0 (dev-eval asserts the recall; this asserts the release path directly, which
    // is the side a release-only change could quietly move).
    const gold = (await readFile(join(FIXTURE, 'records_gold.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map(
        (line) =>
          JSON.parse(line) as {
            record: string
            start: number
            end: number
            category: string
            is_phi: boolean
          }
      )
      .filter(
        (span) =>
          span.is_phi &&
          span.category === 'PERSON_NAME' &&
          // The one documented miss (#103): an 84-character note, outside the guess window. It is a
          // pinned limitation, not a recall this change may or may not keep.
          !span.record.startsWith('known-')
      )
    expect(gold).toHaveLength(14)
    const missing: string[] = []
    for (const span of gold) {
      const text = await readFile(join(FIXTURE, 'records', span.record), 'utf8')
      const result = deidentify(text, newStore())
      const covered = result.replacements.some(
        (item) => item.start <= span.start && item.end >= span.end
      )
      if (!covered) missing.push(span.record)
    }
    expect(missing).toEqual([])
  })
})
