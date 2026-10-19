import { createConnectorRegistry, ParserEngine } from '@aipoch/connector-core'
import { JAPAN_RESEARCH_TOOLS } from '@aipoch/connector-builtins/japan-research'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createClosedGate,
  createVaultBackedGate,
  installMachineApproval,
  installPhiConfirmer,
  installPhiGate,
  MODEL_RELEASE_TIMEOUT_MS,
  PhiGateError
} from '../phi/gate'
import { ORDINARY_LABEL_VOCABULARY } from '../phi/ordinary-label'
import { createMemoryPhiVault } from '../phi/store'
import { ConnectorService, draConnectorFetchPolicy } from './service'

const fixturePhi =
  '患者：架空 太郎\n生年月日：昭和9年2月3日\nカルテ番号：0098765\nマイナンバー：123456789012\n92歳'
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

const search = JAPAN_RESEARCH_TOOLS.find((entry) => entry.id === 'jstage_search')!
const registry = createConnectorRegistry(JAPAN_RESEARCH_TOOLS)
const serviceFor = (engine?: ParserEngine): ConnectorService =>
  new ConnectorService({
    registry,
    engine,
    getConnectors: () => ({ enabledIds: [], autoAllowIds: ['japan-research'] }),
    resolveApiKey: () => undefined
  })
const agent = { origin: 'agent' as const, sessionId: 'fiction', projectId: 'fiction' }

describe('connector query PHI boundary', () => {
  it('refuses fictional patient information before any external search request', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const engine = new ParserEngine({ fetchImpl, retries: 0, policy: draConnectorFetchPolicy })
    await expect(engine.call(search, { query: fixturePhi }, {})).rejects.toBeInstanceOf(
      PhiGateError
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it.each([
    ...Object.values(ORDINARY_LABEL_VOCABULARY).flat(),
    '東病棟',
    '西病棟',
    '内科',
    '外科',
    'glioblastoma'
  ])('preserves the main whole-query label exception: %s', async (query) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          '<feed><status>0</status><totalResults>0</totalResults><startIndex>1</startIndex></feed>',
          { status: 200, headers: { 'content-type': 'application/xml' } }
        )
      )
    const engine = new ParserEngine({ fetchImpl, retries: 0, policy: draConnectorFetchPolicy })
    await engine.call(search, { query }, {})
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(decodeURIComponent(String(fetchImpl.mock.calls[0][0]))).toContain(query)
  })
  it.each([
    '山田太郎',
    '未登録ラベル',
    '患者氏名：山田太郎',
    'カルテ番号：0098765',
    '生年月日：昭和9年2月3日'
  ])('never sends a query with detected patient information: %s', async (query) => {
    const fetchImpl = vi.fn<typeof fetch>()
    const engine = new ParserEngine({ fetchImpl, retries: 0, policy: draConnectorFetchPolicy })
    await expect(engine.call(search, { query }, {})).rejects.toThrow()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it.each(
    ['throw', 'uninitialized', 'timeout'].flatMap((fault) =>
      ['肺癌', 'あり', '不明', '東病棟'].map((query) => [fault, query] as const)
    )
  )('sends no search request on %s for %s', async (fault, query) => {
    const fetchImpl = vi.fn<typeof fetch>()
    const engine = new ParserEngine({ fetchImpl, retries: 0, policy: draConnectorFetchPolicy })
    if (fault === 'throw') installPhiGate(createClosedGate('blocked'))
    if (fault === 'uninitialized') installPhiGate(null)
    if (fault === 'timeout') {
      vi.useFakeTimers()
      installPhiConfirmer(() => new Promise(() => undefined))
    }
    const assertion = expect(engine.call(search, { query }, {})).rejects.toThrow()
    if (fault === 'timeout') await vi.advanceTimersByTimeAsync(MODEL_RELEASE_TIMEOUT_MS)
    await assertion
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('agent-facing connector results', () => {
  it('releases literature tool results before returning them to an agent', async () => {
    const tool = { ...search, run: vi.fn(async () => ({ records: [{ title: fixturePhi }] })) }
    const service = new ConnectorService({
      registry: createConnectorRegistry([tool]),
      getConnectors: () => ({ enabledIds: [], autoAllowIds: ['japan-research'] }),
      resolveApiKey: () => undefined
    })
    const result = JSON.stringify(
      await service.call('japan-research', search.id, { query: 'lung' }, agent)
    )
    for (const value of ['架空 太郎', '昭和9年2月3日', '0098765', '123456789012', '92歳'])
      expect(result).not.toContain(value)
  })
  it.each(['jrct', 'umin'])(
    'returns only non-personal %s CSV columns to the model',
    async (source) => {
      const id = source === 'jrct' ? 'jRCT1234567890' : 'UMIN000000001'
      const result = (await serviceFor().call(
        'japan-research',
        'japan_registry_search_export',
        {
          source,
          query: 'fictional',
          csv: `ID,Title,研究責任者,実施責任者,所属,電話,メール,問い合わせ先\n${id},fictional trial,架空 太郎,架空 花子,架空病院,090-0000-1234,fiction@example.invalid,架空窓口`
        },
        agent
      )) as { records: Record<string, string>[] }
      expect(Object.keys(result.records[0])).toEqual(['ID', 'Title'])
      expect(JSON.stringify(result)).not.toMatch(/架空|090-0000|fiction@/)
    }
  )
  it.each(['jrct', 'umin'])(
    'does not invoke the %s local search when the shared gate fails',
    async (source) => {
      const tool = {
        ...JAPAN_RESEARCH_TOOLS.find((entry) => entry.id === 'japan_registry_search_export')!,
        run: vi.fn()
      }
      const service = new ConnectorService({
        registry: createConnectorRegistry([tool]),
        getConnectors: () => ({ enabledIds: [], autoAllowIds: ['japan-research'] }),
        resolveApiKey: () => undefined
      })
      installPhiGate(createClosedGate('blocked'))
      await expect(
        service.call(
          'japan-research',
          tool.id,
          { source, query: 'fictional', csv: fixturePhi },
          agent
        )
      ).rejects.toThrow()
      expect(tool.run).not.toHaveBeenCalled()
    }
  )
})
