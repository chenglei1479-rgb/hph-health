import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AcpProviderPromptExecutor,
  type ProviderPromptExecutionInput
} from '../acp/provider-prompt-executor'
import { fetchProviderRequest } from '../settings/provider-fetch'
import { assertPhiCheckedAgentProvider } from './agent-policy'
import {
  createClosedGate,
  createVaultBackedGate,
  installMachineApproval,
  installPhiConfirmer,
  installPhiGate,
  installMachineApprovalTranslator,
  MODEL_RELEASE_RETRY_MESSAGE,
  MODEL_RELEASE_TIMEOUT_MS,
  releaseModelBoundValue,
  releasePromptContent
} from './gate'
import { createMemoryPhiVault } from './store'
import { gateNotebookOutputs } from '../notebook/schema-only/release-model-text'
import { releaseCategoricalValuesForModel } from '../notebook/schema-only/categorical-release'
import { buildSchemaModelContext } from '../notebook/schema-only/model-context'
import { englishNativeTranslator, translateNativeMessage } from '../locale/main-process-messages'

// Entirely fictional, never drawn from holdout or patient records.
const PHI =
  '患者：架空 太郎\n生年月日：昭和9年2月3日\nカルテ番号：0098765\nマイナンバー：123456789012\n年齢：92歳'
const forbidden = ['架空 太郎', '昭和9年2月3日', '0098765', '123456789012', '92歳']

beforeEach(() => {
  installPhiGate(createVaultBackedGate(createMemoryPhiVault()))
  installMachineApproval(() => true)
  installPhiConfirmer(null)
})
afterEach(() => {
  vi.useRealTimers()
  installPhiConfirmer(null)
  installMachineApproval(null)
  installMachineApprovalTranslator(englishNativeTranslator)
  installPhiGate(createVaultBackedGate(createMemoryPhiVault()))
})

const paths = [
  ['ordinary prompt', { messages: [{ role: 'user', content: PHI }] }],
  ['project agent context / session setup', { system: PHI, instructions: PHI }],
  ['conversation history / compaction', { messages: [{ role: 'assistant', content: PHI }] }],
  ['tool result / skill output', { input: [{ type: 'function_call_output', output: PHI }] }],
  [
    'notebook output / error stack',
    { messages: [{ content: `Traceback /Users/${PHI}/analysis.py` }] }
  ],
  [
    'literature / registry result',
    { messages: [{ content: JSON.stringify({ records: [{ title: PHI }] }) }] }
  ],
  ['text file attachment', { input: [{ type: 'input_text', text: PHI }] }],
  ['reviewer / writing context', { system: 'Review manuscript', messages: [{ content: PHI }] }]
] as const

describe.each(paths)('%s at the final HTTP boundary', (_name, body) => {
  it('sends only the released payload', async () => {
    const send = vi.fn<typeof fetch>(async () => new Response('{}'))
    await fetchProviderRequest(send, 'https://provider.invalid/v1/messages', {
      method: 'POST',
      body: JSON.stringify(body)
    })
    expect(send).toHaveBeenCalledOnce()
    const sent = String(send.mock.calls[0][1]?.body)
    for (const value of forbidden) expect(sent).not.toContain(value)
  })
  it.each(['throw', 'uninitialized', 'timeout'])('sends no request on %s', async (fault) => {
    const send = vi.fn<typeof fetch>()
    if (fault === 'throw') installPhiGate(createClosedGate('blocked'))
    if (fault === 'uninitialized') installPhiGate(null)
    if (fault === 'timeout') {
      vi.useFakeTimers()
      installPhiConfirmer(() => new Promise(() => undefined))
    }
    const pending = fetchProviderRequest(send, 'https://provider.invalid/v1/messages', {
      method: 'POST',
      body: JSON.stringify(body)
    })
    const assertion = expect(pending).rejects.toThrow()
    if (fault === 'timeout') await vi.advanceTimersByTimeAsync(MODEL_RELEASE_TIMEOUT_MS)
    await assertion
    expect(send).not.toHaveBeenCalled()
  })
})

describe.each(['mentor-pack', 'consultation-pack', 'writing-pack', 'future-pack'])(
  '%s ACP dispatch',
  (pack) => {
    const fixture = (): {
      input: ProviderPromptExecutionInput
      send: ReturnType<typeof vi.fn>
      executor: AcpProviderPromptExecutor
    } => {
      const send = vi.fn(async () => ({ stopReason: 'end_turn' }))
      const input = {
        session: {
          sessionId: 'fiction',
          prompt: send,
          nextUpdate: async () => ({ kind: 'stop', response: { stopReason: 'end_turn' } })
        },
        content: `Package mode: ${pack}\n${PHI}`,
        cwd: '/tmp/fiction',
        frameworkId: 'claude-code',
        mentorPack: pack === 'mentor-pack',
        isCurrent: () => true,
        beforeDispatch: async () => 'active',
        captureStop: () => true,
        onAccepted: () => undefined,
        routeNotification: () => undefined
      } as unknown as ProviderPromptExecutionInput
      const executor = new AcpProviderPromptExecutor({
        backendGeneration: {
          openCodeUsageApi: () => undefined,
          current: { adapter: { nativeMcpEnabled: true, bridgeMcpAliasesEnabled: false } }
        }
      })
      return { input, send, executor }
    }
    it('releases all pack types and retains the mentor hard refusal', async () => {
      const { input, send, executor } = fixture()
      if (pack === 'mentor-pack') await expect(executor.execute(input)).rejects.toThrow()
      else {
        await executor.execute(input)
        expect(send).toHaveBeenCalledOnce()
        for (const value of forbidden) expect(JSON.stringify(send.mock.calls)).not.toContain(value)
      }
      if (pack === 'mentor-pack') expect(send).not.toHaveBeenCalled()
    })
    it.each(['throw', 'uninitialized', 'approval-error'])(
      'never dispatches on %s',
      async (fault) => {
        const { input, send, executor } = fixture()
        // Safe input ensures even a pack with no PHI must pass the working gate.
        const safeInput = { ...input, content: `Package mode: ${pack}\nAggregate study design.` }
        if (fault === 'throw') installPhiGate(createClosedGate('blocked'))
        if (fault === 'uninitialized') installPhiGate(null)
        if (fault === 'approval-error')
          installMachineApproval(() => {
            throw new Error('approval unavailable')
          })
        const assertion = expect(executor.execute(safeInput)).rejects.toThrow()
        await assertion
        expect(send).not.toHaveBeenCalled()
      }
    )
  }
)

describe('local model-bound producers', () => {
  const producers = [
    [
      'schema and synthetic context',
      () =>
        releaseModelBoundValue(
          buildSchemaModelContext({
            tableId: 'fiction',
            rowCount: 12,
            columns: [{ name: PHI, dtype: 'categorical' }]
          }),
          'fiction'
        )
    ],
    ['notebook stdout', () => gateNotebookOutputs({ stdout: PHI }, 'fiction')],
    ['notebook error stack', () => gateNotebookOutputs({ error: `Error: ${PHI}` }, 'fiction')],
    ['categorical values', () => releaseCategoricalValuesForModel([PHI], 'fiction')]
  ] as const
  it.each(producers)('%s is released or refused', async (_name, produce) => {
    let result: unknown
    try {
      result = await produce()
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      return
    }
    const released = JSON.stringify(result)
    for (const value of forbidden) expect(released).not.toContain(value)
  })
  it.each(producers)('%s fails closed when the gate is unavailable', async (_name, produce) => {
    installPhiGate(createClosedGate('blocked'))
    await expect(produce()).rejects.toThrow()
  })
  it.each(producers)('%s defers review until the actual send', async (_name, produce) => {
    const confirm = vi.fn(async () => ({ confirmed: false }))
    installPhiConfirmer(confirm)
    await produce()
    expect(confirm).not.toHaveBeenCalled()
  })
})

it.each(['claude-shared', 'claude-isolated', 'codex-shared', 'codex-isolated'] as const)(
  'blocks %s before any independent process can read PHI',
  (type) => {
    const spawn = vi.fn()
    expect(() => {
      assertPhiCheckedAgentProvider(type)
      spawn(PHI)
    }).toThrow(/beta/)
    expect(spawn).not.toHaveBeenCalled()
    installPhiGate(null)
    expect(() => {
      assertPhiCheckedAgentProvider(type)
      spawn(PHI)
    }).toThrow()
    expect(spawn).not.toHaveBeenCalled()
  }
)

it.each([
  { type: 'image', data: 'fictional-bytes', mimeType: 'image/png' },
  { type: 'resource_link', uri: 'file:///fiction.csv' },
  { type: 'resource', resource: { text: PHI } }
])('blocks opaque ACP attachment $type', async (block) => {
  await expect(releasePromptContent([block], 'fiction')).rejects.toThrow()
})

it('checks an inherited Request body and object keys', async () => {
  const send = vi.fn<typeof fetch>(async () => new Response('{}'))
  const request = new Request('https://provider.invalid/v1/messages', {
    method: 'POST',
    body: JSON.stringify({ [PHI]: PHI })
  })
  await fetchProviderRequest(send, request)
  for (const value of forbidden) expect(String(send.mock.calls[0][1]?.body)).not.toContain(value)
})

it.each([
  { input: [{ type: 'input_image', image_url: 'https://example.invalid/fiction.png' }] },
  { messages: [{ content: [{ type: 'image', source: { type: 'base64', data: 'fiction' } }] }] },
  { input: [{ type: 'input_file', file_id: 'fiction-file' }] },
  { input: [{ type: 'input_audio', input_audio: { data: 'fiction', format: 'wav' } }] },
  { input: [{ type: 'input_text', text: 'data:image/png;base64,fiction' }] }
])('never sends opaque provider content: %j', async (body) => {
  const send = vi.fn<typeof fetch>()
  await expect(
    fetchProviderRequest(send, 'https://provider.invalid/v1/messages', {
      method: 'POST',
      body: JSON.stringify(body)
    })
  ).rejects.toThrow(/attachment/)
  expect(send).not.toHaveBeenCalled()
})

it.each([{}, [], { messages: [] }])(
  'requires a working scanner even for an empty body: %j',
  async (body) => {
    const send = vi.fn<typeof fetch>()
    installPhiGate(createClosedGate('blocked'))
    await expect(
      fetchProviderRequest(send, 'https://provider.invalid/v1/messages', {
        method: 'POST',
        body: JSON.stringify(body)
      })
    ).rejects.toThrow(/privacy check/)
    expect(send).not.toHaveBeenCalled()
  }
)

it('permits tool schema properties named file_id without treating them as uploaded files', async () => {
  const send = vi.fn<typeof fetch>(async () => new Response('{}'))
  await fetchProviderRequest(send, 'https://provider.invalid/v1/messages', {
    method: 'POST',
    body: JSON.stringify({
      tools: [
        {
          type: 'function',
          parameters: {
            type: 'object',
            properties: { file_id: { type: 'string' }, image_url: { type: 'string' } }
          }
        }
      ]
    })
  })
  expect(send).toHaveBeenCalledOnce()
})

it.each(['en', 'ja', 'zh-Hans'] as const)(
  'localizes scanner failure using the selected %s application language',
  async (locale) => {
    installMachineApprovalTranslator((key, options) => translateNativeMessage(locale, key, options))
    installPhiGate(createClosedGate('/fiction/private/scanner-failed'))
    const send = vi.fn<typeof fetch>()
    await expect(
      fetchProviderRequest(send, 'https://provider.invalid/v1/messages', {
        method: 'POST',
        body: JSON.stringify({ messages: [{ content: 'Aggregate study design.' }] })
      })
    ).rejects.toThrow(translateNativeMessage(locale, MODEL_RELEASE_RETRY_MESSAGE))
    expect(send).not.toHaveBeenCalled()
  }
)

it('sends nothing when machine-approval lookup throws, including for clean text', async () => {
  installMachineApproval(() => {
    throw new Error('fictional approval read failure')
  })
  const send = vi.fn<typeof fetch>()
  await expect(
    fetchProviderRequest(send, 'https://provider.invalid/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ content: 'Aggregate study design.' }] })
    })
  ).rejects.toThrow(MODEL_RELEASE_RETRY_MESSAGE)
  expect(send).not.toHaveBeenCalled()
})
