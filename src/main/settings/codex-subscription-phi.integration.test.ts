import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fetch as nodeFetch } from 'undici'
import { afterEach, beforeEach, expect, it, vi, type Mock } from 'vitest'
import { ProviderTransportOwner } from './provider-transport-owner'
import { BackendRoutePlanner, type BackendRoutePlan } from './backend-route-planner'
import type { ResolvedProvider } from './provider-env'
import { OpenAiProviderBridge } from './openai-provider-bridge'
import type { ProviderRuntimeTarget } from './provider-accounts'
import { readCodexSubscriptionHeaders } from './codex-auth'
import { createCodexFramework } from '../agent-framework/codex'
import {
  createClosedGate,
  createVaultBackedGate,
  installMachineApproval,
  installPhiConfirmer,
  installPhiGate,
  MODEL_RELEASE_TIMEOUT_MS
} from '../phi/gate'
import { createMemoryPhiVault } from '../phi/store'

const PHI = '患者：架空 太郎\n生年月日：昭和9年2月3日\nカルテ番号：0098765'
const releases: (() => Promise<void>)[] = []
beforeEach(() => {
  installPhiGate(createVaultBackedGate(createMemoryPhiVault()))
  installMachineApproval(() => true)
  installPhiConfirmer(null)
})
afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(releases.splice(0).map((release) => release()))
  installPhiConfirmer(null)
  installMachineApproval(null)
  installPhiGate(createVaultBackedGate(createMemoryPhiVault()))
})

type Fixture = {
  root: string
  source: string
  target: ProviderRuntimeTarget
  plan: BackendRoutePlan
  send: Mock<typeof fetch>
  transport: Awaited<ReturnType<ProviderTransportOwner['acquire']>>
  projected: ResolvedProvider
  post: (body: unknown, path?: string, token?: string) => ReturnType<typeof nodeFetch>
}

async function fixture(
  type: 'codex-isolated' | 'codex-shared' = 'codex-isolated'
): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'subscription-phi-'))
  releases.push(() => rm(root, { recursive: true, force: true }))
  const source = join(root, 'codex-subscription')
  await mkdir(source)
  await writeFile(
    join(source, 'auth.json'),
    JSON.stringify({
      auth_mode: 'chatgpt',
      tokens: { access_token: 'subscription-secret', account_id: 'account-a' }
    })
  )
  // Imported routes must never choose the checked bridge destination or reach the child.
  await writeFile(
    join(source, 'config.toml'),
    'model_provider = "untrusted"\n[model_providers.untrusted]\nbase_url = "https://bypass.invalid"\n'
  )
  const provider = { id: 'builtin-codex-subscription', type, name: 'Codex', model: 'gpt-5.4' }
  const target: ProviderRuntimeTarget = {
    providerId: provider.id,
    providerType: type,
    effectiveModel: provider.model,
    provider: {
      type,
      model: provider.model,
      apiEndpoints: ['responses'],
      baseUrl: 'https://bypass.invalid',
      responsesBaseUrl: 'https://bypass.invalid'
    },
    apiEndpoints: ['responses'],
    reasoningEffortProfile: { supported: false },
    frameworkCompatible: true,
    modelBridgeSupported: true,
    needsChatResponsesBridge: false,
    needsNativeResponsesCompatibility: false
  }
  const planner = new BackendRoutePlanner({
    providers: {
      resolveRuntimeTarget: () => target,
      resolveRuntimeModelCatalog: () => [target]
    }
  })
  const plan = planner.planBackend({
    settings: { version: 2, providers: [provider] },
    target,
    frameworkId: 'codex',
    effortIntent: 'default',
    conversationSkillImportEnabled: false
  })
  const send = vi.fn<typeof fetch>(
    async () =>
      new Response('data: {"type":"response.completed"}\n\n', {
        headers: { 'content-type': 'text/event-stream' }
      })
  )
  const owner = new ProviderTransportOwner({
    getCodexSubscriptionHeaders: () => readCodexSubscriptionHeaders(root),
    createOpenAiProviderBridge: (targets, initial) =>
      new OpenAiProviderBridge(targets, initial, send)
  })
  const transport = await owner.acquire({ activeTarget: target, plan })
  releases.push(transport.release)
  const projected = transport.provider!
  const post = (
    body: unknown,
    path = '/responses',
    token = projected.key!
  ): ReturnType<typeof nodeFetch> =>
    nodeFetch(`${projected.openaiBaseUrl}${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
  return { root, source, target, plan, send, transport, projected, post }
}

it.each(['codex-isolated', 'codex-shared'] as const)(
  'sends clean %s over the checked subscription endpoint with credential-free runtime homes',
  async (type) => {
    const f = await fixture(type)
    const config = createCodexFramework().prepareModelConfig(f.projected, {
      storageRoot: f.root,
      executablePath: '/codex-acp'
    })
    expect(config.authentication).toEqual({
      methodId: 'api-key',
      _meta: { 'api-key': { apiKey: f.projected.key } }
    })
    expect(config.env?.CODEX_HOME).toBe(join(f.root, 'codex'))
    expect(JSON.stringify(config)).not.toContain('subscription-secret')
    expect(JSON.stringify(config)).not.toContain('bypass.invalid')
    const response = await f.post({
      input: 'Write a methods outline',
      instructions: '',
      stream: true
    })
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('response.completed')
    expect(f.send).toHaveBeenCalledOnce()
    const [url, init] = f.send.mock.calls[0]
    expect(String(url)).toBe('https://chatgpt.com/backend-api/codex/responses')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer subscription-secret')
    expect(new Headers(init?.headers).get('chatgpt-account-id')).toBe('account-a')
    expect(init?.redirect).toBe('manual')
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'gpt-5.4',
      store: false,
      stream: true
    })
  }
)

it.each([
  { input: PHI },
  { instructions: PHI },
  { input: [{ role: 'assistant', content: PHI }] },
  { input: [{ type: 'function_call_output', call_id: 'call-a', output: PHI }] },
  { input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: PHI }] }] }
])('checks the entire later subscription request: %j', async (body) => {
  const f = await fixture()
  await (await f.post({ input: 'clean first turn', instructions: '' })).text()
  await (await f.post(body)).text()
  expect(f.send).toHaveBeenCalledTimes(2)
  const sent = String(f.send.mock.calls[1][1]?.body)
  for (const canary of ['架空 太郎', '昭和9年2月3日', '0098765']) expect(sent).not.toContain(canary)
})

it.each(['fault', 'uninitialized', 'opaque', 'credential', 'malformed'] as const)(
  'sends nothing on %s',
  async (fault) => {
    const f = await fixture()
    if (fault === 'fault') installPhiGate(createClosedGate('scanner failed'))
    if (fault === 'uninitialized') installPhiGate(null)
    if (fault === 'credential') await writeFile(join(f.source, 'auth.json'), '{}')
    if (fault === 'malformed') await writeFile(join(f.source, 'auth.json'), '{sensitive-auth-value')
    const response = await f.post(
      fault === 'opaque'
        ? { input: [{ type: 'input_image', image_url: 'https://opaque.invalid/image' }] }
        : { input: PHI }
    )
    expect(response.ok).toBe(false)
    expect(await response.text()).not.toContain('sensitive-auth-value')
    expect(f.send).not.toHaveBeenCalled()
  }
)

it('sends nothing when native review times out', async () => {
  const f = await fixture()
  let entered!: () => void
  const reviewing = new Promise<void>((resolve) => {
    entered = resolve
  })
  installPhiConfirmer(async () => {
    entered()
    return new Promise(() => {})
  })
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const response = f.post({ input: PHI })
  await reviewing
  await vi.advanceTimersByTimeAsync(MODEL_RELEASE_TIMEOUT_MS + 1)
  vi.useRealTimers()
  expect((await response).ok).toBe(false)
  expect(f.send).not.toHaveBeenCalled()
})

it('rejects other native endpoints, uploads and invalid loopback credentials without forwarding', async () => {
  const f = await fixture()
  for (const path of ['/responses/compact', '/files', '/models']) {
    expect((await f.post({ input: PHI }, path)).status).toBe(404)
  }
  expect((await f.post({ input: PHI }, '/responses', 'wrong')).status).toBe(401)
  expect(f.send).not.toHaveBeenCalled()
})

it('rejects a subscription plan without its boundary or credential owner', async () => {
  const f = await fixture()
  await expect(
    new ProviderTransportOwner().acquire({ activeTarget: f.target, plan: f.plan })
  ).rejects.toThrow(/checked connection/)
  await expect(
    new ProviderTransportOwner({ getCodexSubscriptionHeaders: async () => ({}) }).acquire({
      activeTarget: f.target,
      plan: { ...f.plan, transport: { kind: 'direct' } }
    })
  ).rejects.toThrow(/checked connection/)
})

it('does not send patient information without machine approval', async () => {
  const f = await fixture()
  installMachineApproval(() => false)
  const response = await f.post({ input: PHI })
  expect(response.ok).toBe(false)
  expect(f.send).not.toHaveBeenCalled()
})

it('rechecks a live subscription after a successful clean send', async () => {
  const f = await fixture()
  await (await f.post({ input: 'hello' })).text()
  expect(f.send).toHaveBeenCalledOnce()
  installPhiGate(createClosedGate('late scanner failure'))
  expect((await f.post({ input: 'hello' })).ok).toBe(false)
  expect(f.send).toHaveBeenCalledOnce()
})

it('loads fresh subscription credentials in main without changing the child token', async () => {
  const f = await fixture()
  await (await f.post({ input: 'hello' })).text()
  await writeFile(
    join(f.source, 'auth.json'),
    JSON.stringify({
      auth_mode: 'chatgpt',
      tokens: { access_token: 'fresh-secret', account_id: 'account-a' }
    })
  )
  await (await f.post({ input: 'hello again' })).text()
  expect(f.send).toHaveBeenCalledTimes(2)
  expect(new Headers(f.send.mock.calls[1][1]?.headers).get('authorization')).toBe(
    'Bearer fresh-secret'
  )
  expect(f.projected.key).not.toBe('fresh-secret')
})
