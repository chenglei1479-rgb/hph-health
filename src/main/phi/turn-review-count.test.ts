import { createConnectorRegistry } from '@aipoch/connector-core'
import { JAPAN_RESEARCH_TOOLS } from '@aipoch/connector-builtins/japan-research'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  AcpProviderPromptExecutor,
  type ProviderPromptExecutionInput
} from '../acp/provider-prompt-executor'
import { ConnectorService } from '../connectors/service'
import { fetchProviderRequest } from '../settings/provider-fetch'
import {
  createVaultBackedGate,
  installMachineApproval,
  installPhiConfirmer,
  installPhiGate,
  MODEL_RELEASE_TIMEOUT_MS,
  PHI_CONSENT_EXPIRY_MS,
  releaseModelText,
  withPhiTurn
} from './gate'
import { createMemoryPhiVault } from './store'

beforeEach(() => {
  installPhiGate(createVaultBackedGate(createMemoryPhiVault()))
  installMachineApproval(() => true)
})
afterEach(() => {
  vi.useRealTimers()
  installPhiConfirmer(null)
  installMachineApproval(null)
})

// Exercise the entire turn, including tool preflight, query checks and later responses.
it.each([0, 1, 3].flatMap((roundTrips) => [false, true].map((phi) => ({ roundTrips, phi }))))(
  'counts reviews for a turn with $roundTrips tool round trips, PHI=$phi',
  async ({ roundTrips, phi }) => {
    const confirm = vi.fn(async () => ({ confirmed: true }))
    installPhiConfirmer(confirm)
    const send = vi.fn<typeof fetch>(async () => new Response('{}'))
    const tool = {
      ...JAPAN_RESEARCH_TOOLS.find((entry) => entry.id === 'jstage_search')!,
      run: vi.fn(async () => (phi ? { title: '患者：架空 花子' } : { count: 20 }))
    }
    const connectors = new ConnectorService({
      registry: createConnectorRegistry([tool]),
      getConnectors: () => ({ enabledIds: [], autoAllowIds: ['japan-research'] }),
      resolveApiKey: () => undefined
    })
    const http = (content: unknown): Promise<Response> =>
      fetchProviderRequest(send, 'https://provider.invalid/v1/messages', {
        method: 'POST',
        body: JSON.stringify({ messages: [{ content }] })
      })
    let turn!: Promise<{ stopReason: string }>
    const prompt = vi.fn((content: unknown) => {
      turn = (async () => {
        await http(content)
        for (let i = 0; i < roundTrips; i++) {
          const result = await connectors.call(
            'japan-research',
            tool.id,
            { query: 'study_design' },
            {
              origin: 'agent',
              sessionId: 'fiction',
              projectId: 'fiction'
            }
          )
          await http(result)
        }
        return { stopReason: 'end_turn' }
      })()
      return turn
    })
    const executor = new AcpProviderPromptExecutor({
      backendGeneration: {
        openCodeUsageApi: () => undefined,
        current: { adapter: { nativeMcpEnabled: true, bridgeMcpAliasesEnabled: false } }
      }
    })
    await executor.execute({
      session: {
        sessionId: 'fiction',
        prompt,
        nextUpdate: async () => {
          await turn
          return { kind: 'stop', response: { stopReason: 'end_turn' } }
        }
      },
      content: phi ? '患者：架空 太郎' : 'study_design',
      cwd: '/tmp/fiction',
      frameworkId: 'claude-code',
      isCurrent: () => true,
      beforeDispatch: async () => 'active',
      captureStop: () => true,
      onAccepted: () => undefined,
      routeNotification: () => undefined
    } as unknown as ProviderPromptExecutionInput)
    expect(send).toHaveBeenCalledTimes(roundTrips + 1)
    expect(tool.run).toHaveBeenCalledTimes(roundTrips)
    expect(confirm).toHaveBeenCalledTimes(phi ? roundTrips + 1 : 0)
    for (const [preview] of confirm.mock.calls as unknown as [{ highlights: unknown[] }][]) {
      expect(preview.highlights.length).toBeGreaterThan(0)
    }
  }
)

const body = (content = '患者：架空 太郎'): string => JSON.stringify({ messages: [{ content }] })
const request = (
  send: typeof fetch,
  payload = body(),
  destination = 'https://provider.invalid/v1/messages'
): Promise<Response> => fetchProviderRequest(send, destination, { method: 'POST', body: payload })

it.each(['dismiss', 'throw', 'timeout', 'expired', 'approval', 'gate', 'superseded'])(
  'sends nothing when the combined review is %s',
  async (fault) => {
    vi.useFakeTimers()
    let current = true
    const send = vi.fn<typeof fetch>()
    const confirm = vi.fn(async () => {
      if (fault === 'dismiss') return { confirmed: false }
      if (fault === 'throw') throw new Error('review failed')
      if (fault === 'timeout') return new Promise<{ confirmed: boolean }>(() => undefined)
      if (fault === 'expired') vi.setSystemTime(Date.now() + PHI_CONSENT_EXPIRY_MS)
      if (fault === 'approval') installMachineApproval(() => false)
      if (fault === 'gate') installPhiGate(null)
      if (fault === 'superseded') current = false
      return { confirmed: true }
    })
    installPhiConfirmer(confirm)
    const pending = withPhiTurn(
      'fiction',
      () => current,
      () => request(send)
    )
    const blocked = expect(pending).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(MODEL_RELEASE_TIMEOUT_MS)
    await blocked
    expect(send).not.toHaveBeenCalled()
    expect(confirm).toHaveBeenCalledOnce()
  }
)

it('never reuses consent across identical retries, changed bytes, new PHI, destinations, projects or turns', async () => {
  const confirm = vi.fn(async () => ({ confirmed: true }))
  installPhiConfirmer(confirm)
  const send = vi.fn<typeof fetch>(async () => new Response('{}'))
  for (const project of ['one', 'two']) {
    for (let turn = 0; turn < 2; turn++) {
      await withPhiTurn(
        project,
        () => true,
        async () => {
          const prepared = await releaseModelText('患者：架空 太郎', project)
          expect(confirm).toHaveBeenCalledTimes(send.mock.calls.length)
          await request(send, body(prepared))
          await request(send, body(prepared))
          await request(send, body(prepared + ' Changed instructions.'))
          await request(send, body(prepared + ' 患者：架空 花子'))
          await request(send, body(prepared), 'https://other.invalid/v1/messages')
        }
      )
    }
  }
  expect(send).toHaveBeenCalledTimes(20)
  expect(confirm).toHaveBeenCalledTimes(20)
  expect(JSON.stringify(send.mock.calls)).not.toMatch(/架空/)
})

it('rejects a late review from a completed turn', async () => {
  let finish!: (decision: { confirmed: boolean }) => void
  installPhiConfirmer(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const send = vi.fn<typeof fetch>()
  let pending!: Promise<Response>
  await withPhiTurn(
    'closed-turn',
    () => true,
    async () => {
      pending = request(send)
      await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    }
  )
  const blocked = expect(pending).rejects.toThrow()
  finish({ confirmed: true })
  await blocked
  expect(send).not.toHaveBeenCalled()
})

it('keeps concurrent turns and their projects isolated', async () => {
  const pending: Array<() => void> = []
  installPhiConfirmer(
    () =>
      new Promise((resolve) => {
        pending.push(() => resolve({ confirmed: true }))
      })
  )
  const send = vi.fn<typeof fetch>(async () => new Response('{}'))
  const first = withPhiTurn(
    'first',
    () => true,
    () => request(send)
  )
  const second = withPhiTurn(
    'second',
    () => true,
    () => request(send)
  )
  await vi.waitFor(() => expect(pending).toHaveLength(2))
  pending[1]()
  pending[0]()
  await Promise.all([first, second])
  expect(send).toHaveBeenCalledTimes(2)
})

it('does not send when the originating HTTP request is cancelled during review', async () => {
  const controller = new AbortController()
  installPhiConfirmer(async () => {
    controller.abort()
    return { confirmed: true }
  })
  const send = vi.fn<typeof fetch>()
  await expect(
    fetchProviderRequest(send, 'https://provider.invalid/v1/messages', {
      method: 'POST',
      body: body(),
      signal: controller.signal
    })
  ).rejects.toThrow()
  expect(send).not.toHaveBeenCalled()
})

it('captures the reviewed bytes and destination before mutable caller options change', async () => {
  const destination = new URL('https://provider.invalid/v1/messages')
  const init = { method: 'POST', body: body() }
  installPhiConfirmer(async () => {
    destination.hostname = 'other.invalid'
    init.body = body('患者：架空 花子')
    return { confirmed: true }
  })
  const send = vi.fn<typeof fetch>(async () => new Response('{}'))
  await fetchProviderRequest(send, destination, init)
  expect(send.mock.calls[0][0]).toBe('https://provider.invalid/v1/messages')
  expect(send.mock.calls[0][1]?.body).not.toBe(init.body)
  expect(String(send.mock.calls[0][1]?.body)).not.toContain('花子')
})

it('does not reuse a decision after manual masking', async () => {
  const confirm = vi.fn(async (preview: { text: string }) => {
    const start = preview.text.indexOf('Unrecognized')
    return {
      confirmed: true,
      extraSpans: start < 0 ? [] : [{ start, end: start + 'Unrecognized'.length }]
    }
  })
  installPhiConfirmer(confirm)
  const send = vi.fn<typeof fetch>(async () => new Response('{}'))
  await withPhiTurn(
    'manual',
    () => true,
    async () => {
      await request(send, body('患者：架空 太郎 Unrecognized'))
      const released = String(send.mock.calls[0][1]?.body)
      expect(released).not.toContain('Unrecognized')
      await request(send, released)
      await request(send, body('患者：架空 花子'))
    }
  )
  expect(confirm).toHaveBeenCalledTimes(3)
  expect(send).toHaveBeenCalledTimes(3)
})

it('sends nothing when a synchronous scanner returns after the release deadline', async () => {
  vi.useFakeTimers()
  installPhiGate({
    release: (text) => {
      vi.setSystemTime(Date.now() + MODEL_RELEASE_TIMEOUT_MS)
      return { text, replacements: [], warnings: [] }
    },
    restore: (text) => text
  })
  const confirm = vi.fn(async () => ({ confirmed: true }))
  installPhiConfirmer(confirm)
  const send = vi.fn<typeof fetch>()
  await expect(request(send, body('study_design'))).rejects.toThrow()
  expect(confirm).not.toHaveBeenCalled()
  expect(send).not.toHaveBeenCalled()
})

it.each(['completed', 'superseded', 'superseded-during-scan'])(
  'rejects a %s turn before opening a PHI reviewer',
  async (state) => {
    const confirm = vi.fn(async () => ({ confirmed: true }))
    installPhiConfirmer(confirm)
    const send = vi.fn<typeof fetch>()
    let current = state !== 'superseded'
    let pending!: Promise<Response>
    if (state === 'completed') {
      let resume!: () => void
      const delayed = new Promise<void>((resolve) => {
        resume = resolve
      })
      await withPhiTurn(
        'stale',
        () => current,
        async () => {
          // Promise continuations retain their originating async context after the turn ends.
          pending = delayed.then(() => request(send))
        }
      )
      const blocked = expect(pending).rejects.toThrow()
      resume()
      await blocked
    } else {
      pending = withPhiTurn(
        'stale',
        () => current,
        async () => {
          const response = request(send)
          if (state === 'superseded-during-scan') current = false
          return response
        }
      )
      await expect(pending).rejects.toThrow()
    }
    expect(confirm).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  }
)
