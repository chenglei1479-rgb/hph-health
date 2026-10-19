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
  installPhiGate
} from './gate'
import { createMemoryPhiVault } from './store'

beforeEach(() => {
  installPhiGate(createVaultBackedGate(createMemoryPhiVault()))
  installMachineApproval(() => true)
})
afterEach(() => {
  installPhiConfirmer(null)
  installMachineApproval(null)
})

// This characterizes current behavior; it does not change review frequency or add consent reuse.
it.each([0, 1, 3])(
  'counts reviews for an agent turn with %i local tool round trips',
  async (roundTrips) => {
    const confirm = vi.fn(async () => ({ confirmed: true }))
    installPhiConfirmer(confirm)
    const send = vi.fn<typeof fetch>(async () => new Response('{}'))
    const tool = {
      ...JAPAN_RESEARCH_TOOLS.find((entry) => entry.id === 'jstage_search')!,
      run: vi.fn(async () => ({ count: 20 }))
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
    const prompt = vi.fn(() => {
      turn = (async () => {
        await http('study_design')
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
      content: 'study_design',
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
    expect(confirm).toHaveBeenCalledTimes(2 + 5 * roundTrips)
    for (const [preview] of confirm.mock.calls as unknown as [{ highlights: unknown[] }][]) {
      expect(preview.highlights).toEqual([])
    }
  }
)
