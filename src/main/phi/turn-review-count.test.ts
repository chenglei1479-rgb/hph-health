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
  installMachineApprovalTranslator,
  PHI_SEND_CANCELLED_MESSAGE,
  sendPhiChecked,
  MODEL_RELEASE_TIMEOUT_MS,
  PHI_CONSENT_EXPIRY_MS,
  releaseModelText,
  releasePromptContent,
  withPhiTurn
} from './gate'
import { createMemoryPhiVault } from './store'
import { englishNativeTranslator, translateNativeMessage } from '../locale/main-process-messages'
import type { PhiPreview } from './confirm'
import type { PhiReplacement, PhiResult } from './deidentify'

beforeEach(() => {
  installPhiGate(createVaultBackedGate(createMemoryPhiVault()))
  installMachineApproval(() => true)
})
afterEach(() => {
  vi.useRealTimers()
  installPhiConfirmer(null)
  installMachineApproval(null)
  installMachineApprovalTranslator(englishNativeTranslator)
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
      run: vi.fn(async () => (phi ? { title: '患者：架空 太郎' } : { count: 20 }))
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
    expect(confirm).toHaveBeenCalledTimes(phi ? 1 : 0)
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

it.each(['dismiss', 'throw', 'timeout', 'expired', 'approval', 'gate', 'confirmer', 'superseded'])(
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
      if (fault === 'confirmer') installPhiConfirmer(async () => ({ confirmed: true }))
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

it('reuses only known replacements within one turn and destination; isolates projects and turns', async () => {
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
          expect(confirm).toHaveBeenCalledTimes(turn * 3 + (project === 'two' ? 6 : 0))
          await request(send, body(prepared))
          await request(send, body(prepared))
          await request(
            send,
            JSON.stringify({
              messages: [{ content: prepared }, { content: 'study_design' }]
            })
          )
          await request(
            send,
            JSON.stringify({ messages: [{ content: prepared }, { content: '患者：架空 花子' }] })
          )
          await request(send, body(prepared), 'https://other.invalid/v1/messages')
        }
      )
    }
  }
  expect(send).toHaveBeenCalledTimes(20)
  expect(confirm).toHaveBeenCalledTimes(12)
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

it.each(['first', 'second'])(
  'keeps concurrent turns isolated with project %s',
  async (secondProject) => {
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
      secondProject,
      () => true,
      () => request(send)
    )
    await vi.waitFor(() => expect(pending).toHaveLength(2))
    pending[1]()
    pending[0]()
    await Promise.all([first, second])
    expect(send).toHaveBeenCalledTimes(2)
  }
)

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

it('remembers explicitly reviewed manual masking but prompts for new PHI', async () => {
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
  expect(confirm).toHaveBeenCalledTimes(2)
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

// Include prior messages on every tool hop, just like a provider's conversation history.
it.each([1, 2, 3])('reviews only new replacements at tool hop %s', async (newAt) => {
  const previews: PhiPreview[] = []
  installPhiConfirmer(async (preview) => {
    previews.push(preview)
    return { confirmed: true }
  })
  const send = vi.fn<typeof fetch>(async () => new Response('{}'))
  await withPhiTurn(
    'fiction',
    () => true,
    async () => {
      const history = [{ content: '患者：架空 太郎' }]
      await request(send, JSON.stringify({ messages: history }))
      for (let hop = 1; hop <= 3; hop++) {
        history.push({ content: hop === newAt ? '患者：架空 花子' : 'study_design' })
        await request(send, JSON.stringify({ messages: history }))
      }
    }
  )
  expect(send).toHaveBeenCalledTimes(4)
  expect(previews).toHaveLength(2)
  const marked = (preview: PhiPreview): string[] =>
    preview.highlights.map((mark) => preview.text.slice(mark.start, mark.end))
  expect(marked(previews[0])).toHaveLength(1)
  expect(marked(previews[1])).toHaveLength(1)
  expect(marked(previews[1])[0]).not.toBe(marked(previews[0])[0])
  expect(previews[1].text).toContain(marked(previews[0])[0])
})

it('reviews newly prepared manual placeholders, including when other PHI is already confirmed', async () => {
  const vault = createMemoryPhiVault()
  installPhiGate(createVaultBackedGate(vault))
  const confirm = vi.fn(async () => ({ confirmed: true }))
  installPhiConfirmer(confirm)
  const send = vi.fn<typeof fetch>(async () => new Response('{}'))
  await withPhiTurn(
    'fiction',
    () => true,
    async () => {
      const prepared = await releaseModelText('患者：架空 太郎', 'fiction')
      await request(send, body(prepared))
      const manual = vault.store('fiction').manual('Fictional unrecognized identifier')
      await request(
        send,
        JSON.stringify({ messages: [{ content: prepared }, { content: manual }] })
      )
      await request(
        send,
        JSON.stringify({ messages: [{ content: prepared }, { content: manual }] })
      )
    }
  )
  expect(confirm).toHaveBeenCalledTimes(2)
  const second = (confirm.mock.calls as unknown as [PhiPreview][])[1][0]
  expect(second.highlights).toHaveLength(1)
  expect(second.highlights[0].category).toBe('MANUAL')
})

it.each(['gate', 'confirmer', 'approval'])(
  'invalidates confirmed replacements after %s replacement',
  async (fault) => {
    const installed = createVaultBackedGate(createMemoryPhiVault())
    const confirm = vi.fn(async () => ({ confirmed: true }))
    const approved = (): boolean => true
    installPhiGate(installed)
    installPhiConfirmer(confirm)
    installMachineApproval(approved)
    const send = vi.fn<typeof fetch>(async () => new Response('{}'))
    await withPhiTurn(
      'fiction',
      () => true,
      async () => {
        await request(send)
        // Replace and restore the same instance: reference equality alone must not authorize it.
        if (fault === 'gate') {
          installPhiGate(null)
          installPhiGate(installed)
        }
        if (fault === 'confirmer') {
          installPhiConfirmer(null)
          installPhiConfirmer(confirm)
        }
        if (fault === 'approval') {
          installMachineApproval(null)
          installMachineApproval(approved)
        }
        await request(send)
      }
    )
    expect(confirm).toHaveBeenCalledTimes(2)
  }
)

it.each(['gate', 'confirmer', 'approval'])(
  'blocks a pending send even if replaced %s is restored',
  async (fault) => {
    const installed = createVaultBackedGate(createMemoryPhiVault())
    const approved = (): boolean => true
    const confirm = vi.fn(async () => {
      if (fault === 'gate') {
        installPhiGate(null)
        installPhiGate(installed)
      }
      if (fault === 'confirmer') {
        installPhiConfirmer(null)
        installPhiConfirmer(confirm)
      }
      if (fault === 'approval') {
        installMachineApproval(null)
        installMachineApproval(approved)
      }
      return { confirmed: true }
    })
    installPhiGate(installed)
    installMachineApproval(approved)
    installPhiConfirmer(confirm)
    const send = vi.fn<typeof fetch>()
    await expect(
      withPhiTurn(
        'fiction',
        () => true,
        () => request(send)
      )
    ).rejects.toThrow()
    expect(send).not.toHaveBeenCalled()
  }
)

it.each(['en', 'ja', 'zh-Hans'] as const)('reports cancelled sending in %s', async (locale) => {
  installMachineApprovalTranslator((key, options) => translateNativeMessage(locale, key, options))
  installPhiConfirmer(async () => ({ confirmed: false }))
  const send = vi.fn<typeof fetch>()
  await expect(request(send)).rejects.toThrow(
    translateNativeMessage(locale, PHI_SEND_CANCELLED_MESSAGE)
  )
  expect(send).not.toHaveBeenCalled()
})

it('times out a hung asynchronous scanner and never dispatches its late result', async () => {
  vi.useFakeTimers()
  let finish!: () => void
  let waiting = true
  installPhiGate({
    release: async (text) => {
      if (waiting) {
        waiting = false
        await new Promise<void>((resolve) => {
          finish = resolve
        })
      }
      return { text, replacements: [], warnings: [] }
    },
    restore: (text) => text
  })
  const send = vi.fn<typeof fetch>()
  const pending = request(send, body('study_design'))
  const blocked = expect(pending).rejects.toThrow()
  await vi.advanceTimersByTimeAsync(MODEL_RELEASE_TIMEOUT_MS)
  await blocked
  expect(send).not.toHaveBeenCalled()
  finish()
  await vi.advanceTimersByTimeAsync(MODEL_RELEASE_TIMEOUT_MS)
  expect(send).not.toHaveBeenCalled()
})

it('still scans each request and rechecks restored PHI after confirmation', async () => {
  const installed = createVaultBackedGate(createMemoryPhiVault())
  const release = vi.spyOn(installed, 'release')
  let approved = true
  installPhiGate(installed)
  installMachineApproval(() => approved)
  const confirm = vi.fn(async () => ({ confirmed: true }))
  installPhiConfirmer(confirm)
  const send = vi.fn<typeof fetch>(async () => new Response('{}'))
  await withPhiTurn(
    'fiction',
    () => true,
    async () => {
      await request(send)
      const masked = String(send.mock.calls[0][1]?.body)
      const before = release.mock.calls.length
      await request(send, masked)
      expect(release.mock.calls.length).toBeGreaterThan(before)
      expect(confirm).toHaveBeenCalledOnce()
      approved = false
      await expect(request(send, masked)).rejects.toThrow()
    }
  )
  expect(send).toHaveBeenCalledTimes(2)
})

it('does not retain confirmation outside a turn', async () => {
  const confirm = vi.fn(async () => ({ confirmed: true }))
  installPhiConfirmer(confirm)
  const send = vi.fn(async () => undefined)
  await sendPhiChecked(body(), 'https://provider.invalid', send, 'fiction')
  await sendPhiChecked(body(), 'https://provider.invalid', send, 'fiction')
  expect(confirm).toHaveBeenCalledTimes(2)
})

it('reviews a new source even when generalized replacement text is already confirmed', async () => {
  const confirm = vi.fn(async () => ({ confirmed: true }))
  installPhiConfirmer(confirm)
  const send = vi.fn<typeof fetch>(async () => new Response('{}'))
  await withPhiTurn(
    'fiction',
    () => true,
    async () => {
      await request(send, body('年齢：92歳'))
      await request(send, body('年齢：92歳'))
      expect(confirm).toHaveBeenCalledOnce()
      await request(send, body('年齢：93歳'))
      expect(confirm).toHaveBeenCalledTimes(2)
    }
  )
})

it('matches previously prepared vault placeholders to later raw occurrences of the same PHI', async () => {
  const confirm = vi.fn(async () => ({ confirmed: true }))
  installPhiConfirmer(confirm)
  const send = vi.fn<typeof fetch>(async () => new Response('{}'))
  await withPhiTurn(
    'fiction',
    () => true,
    async () => {
      const prepared = await releaseModelText('患者：架空 太郎', 'fiction')
      await request(send, body(prepared))
      await request(send, body('患者：架空 太郎'))
      expect(confirm).toHaveBeenCalledOnce()
    }
  )
})

it('reviews again after an asynchronous send rejects in the same turn', async () => {
  const confirm = vi.fn(async () => ({ confirmed: true }))
  installPhiConfirmer(confirm)
  const send = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new Error('Fictional transport failure'))
    .mockResolvedValue(new Response('{}'))
  await withPhiTurn(
    'fiction',
    () => true,
    async () => {
      await expect(request(send)).rejects.toThrow('Fictional transport failure')
      expect(confirm).toHaveBeenCalledOnce()
      await request(send)
      expect(confirm).toHaveBeenCalledTimes(2)
      await request(send)
      expect(confirm).toHaveBeenCalledTimes(2)
    }
  )
  expect(send).toHaveBeenCalledTimes(3)
})

it.each(['prompt', 'provider'])(
  'preserves synchronous numbering and token order for delayed %s scanning',
  async (path) => {
    vi.useFakeTimers()
    const snapshots: Array<{ output: unknown; events: string[] }> = []
    const names = ['fiction_first', 'fiction_second', 'fiction_third']
    const delays = [40, 1, 10]
    for (const delayed of [false, true]) {
      const store = createMemoryPhiVault().store('fiction')
      const events: string[] = []
      const allocate = (text: string): PhiResult => {
        if (!names.includes(text)) return { text, replacements: [], warnings: [] }
        const replacement = store.placeholder('PERSON_NAME', text, '患者')
        events.push(`release:${text}`)
        const token: PhiReplacement = {
          start: 0,
          end: text.length,
          category: 'PERSON_NAME',
          original: text,
          replacement,
          shifted: false
        }
        const replacements = [token]
        // Observe the order in which walkRelease appends each scanner's replacements.
        replacements[Symbol.iterator] = function* (): Generator<PhiReplacement> {
          events.push(`tokens:${text}`)
          yield token
        }
        return { text: replacement, replacements, warnings: [] }
      }
      installPhiGate({
        release: (text) =>
          delayed && names.includes(text)
            ? new Promise<PhiResult>((resolve) =>
                setTimeout(() => resolve(allocate(text)), delays[names.indexOf(text)])
              )
            : allocate(text),
        restore: (text) => store.restore(text)
      })
      installPhiConfirmer(async () => ({ confirmed: true }))
      const send = vi.fn<typeof fetch>(async () => new Response('{}'))
      const pending =
        path === 'prompt'
          ? releasePromptContent(
              names.map((text) => ({ type: 'text', text })),
              'fiction'
            )
          : request(send, JSON.stringify({ messages: names.map((content) => ({ content })) }))
      await vi.advanceTimersByTimeAsync(100)
      const result = await pending
      const output = path === 'prompt' ? result : JSON.parse(String(send.mock.calls[0][1]?.body))
      snapshots.push({ output, events })
      expect(events).toEqual(
        names.flatMap((name) =>
          path === 'prompt' ? [`release:${name}`] : [`release:${name}`, `tokens:${name}`]
        )
      )
      expect(JSON.stringify(output)).toContain('[患者1]')
      expect(JSON.stringify(output)).toContain('[患者2]')
      expect(JSON.stringify(output)).toContain('[患者3]')
    }
    expect(snapshots[1]).toEqual(snapshots[0])
  }
)
