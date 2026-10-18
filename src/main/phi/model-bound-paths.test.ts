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
  MODEL_RELEASE_TIMEOUT_MS,
  releaseModelBoundValue,
  releasePromptContent
} from './gate'
import { createMemoryPhiVault } from './store'
import { gateNotebookOutputs } from '../notebook/schema-only/release-model-text'
import { releaseCategoricalValuesForModel } from '../notebook/schema-only/categorical-release'
import { buildSchemaModelContext } from '../notebook/schema-only/model-context'

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
    it.each(['throw', 'timeout'])('never dispatches on %s', async (fault) => {
      const { input, send, executor } = fixture()
      // Safe input ensures even a pack with no PHI must pass the working gate.
      const safeInput = { ...input, content: `Package mode: ${pack}\nAggregate study design.` }
      if (fault === 'throw') installPhiGate(createClosedGate('blocked'))
      else {
        vi.useFakeTimers()
        installPhiConfirmer(() => new Promise(() => undefined))
      }
      const assertion = expect(executor.execute(safeInput)).rejects.toThrow()
      if (fault === 'timeout') await vi.advanceTimersByTimeAsync(MODEL_RELEASE_TIMEOUT_MS)
      await assertion
      expect(send).not.toHaveBeenCalled()
    })
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
  it.each(producers)('%s fails closed on timeout', async (_name, produce) => {
    vi.useFakeTimers()
    installPhiConfirmer(() => new Promise(() => undefined))
    const assertion = expect(produce()).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(MODEL_RELEASE_TIMEOUT_MS)
    await assertion
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
