import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

import { flushLogs, initLogger } from '@aipoch/diagnostics/node'
import { fetch as nodeFetch } from 'undici'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { adaptCodeBuddyChatCompletionsRequest } from './codebuddy-chat-request-adapter'
import { createVaultBackedGate, installMachineApproval, installPhiGate } from '../phi/gate'
import { createMemoryPhiVault } from '../phi/store'
import { OpenAiProviderBridge, type OpenAiProviderBridgeTarget } from './openai-provider-bridge'
import { OPENCODE_TOOL_IMAGE_REQUEST_FIXTURE } from './provider-tool-image-wire.test-fixtures'

type CapturedRequest = {
  authorization?: string
  body: Record<string, unknown>
  path?: string
}

const listen = async (server: Server): Promise<string> => {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address() as AddressInfo
  return `http://127.0.0.1:${address.port}`
}

const close = async (server: Server): Promise<void> => {
  if (!server.listening) return
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  )
}

const createUpstream = (): { requests: CapturedRequest[]; server: Server } => {
  const requests: CapturedRequest[] = []
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
      requests.push({
        authorization: request.headers.authorization,
        body,
        path: request.url
      })
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ model: body.model }))
    })
  })
  return { requests, server }
}

describe('OpenAiProviderBridge', () => {
  const servers: Server[] = []
  const bridges: OpenAiProviderBridge[] = []

  afterEach(async () => {
    await Promise.all(bridges.splice(0).map((bridge) => bridge.close()))
    await Promise.all(servers.splice(0).map(close))
  })

  it.each([false, true])(
    'decodes upstream compression when the client accepts zstd (stream=%s)',
    async (stream) => {
      const json = '{"type":"message_stop"}'
      const payload = stream ? `event: message_stop\ndata: ${json}\n\n` : json
      // Real Zstandard frames: reproduces the '(' (0x28) JSON error without a zstd runtime dependency.
      const zstd = Buffer.from(
        stream
          ? 'KLUv/SAzfQEAdAJldmVudDogbWVzc2FnZV9zdG9wCmRhdGE6IHsidHlwZSI6IiJ9CgoBAHtuPgE='
          : 'KLUv/SAXuQAAeyJ0eXBlIjoibWVzc2FnZV9zdG9wIn0=',
        'base64'
      )
      const upstream = createServer((request, response) => {
        request.resume()
        request.on('end', () => {
          const encoding = request.headers['accept-encoding']?.includes('zstd') ? 'zstd' : 'gzip'
          response.writeHead(200, {
            'content-type': stream ? 'text/event-stream' : 'application/json',
            'content-encoding': encoding
          })
          response.end(encoding === 'zstd' ? zstd : gzipSync(payload))
        })
      })
      servers.push(upstream)
      const target: OpenAiProviderBridgeTarget = {
        id: 'compressed-provider',
        wire: 'chat-completions',
        endpoint: `${await listen(upstream)}/v1/chat/completions`,
        model: 'model-a'
      }
      const bridge = new OpenAiProviderBridge(
        [target],
        target.id,
        nodeFetch as unknown as typeof fetch
      )
      const requestPath = '/v1/chat/completions'
      bridges.push(bridge)
      const connection = await bridge.start()
      const response = await fetch(`${connection.baseUrl}${requestPath}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${connection.token}`,
          'content-type': 'application/json',
          'accept-encoding': 'gzip, deflate, br, zstd'
        },
        body: JSON.stringify({ model: 'model-a', messages: [], stream })
      })
      expect(response.status).toBe(200)
      expect(response.headers.get('content-encoding')).toBeNull()
      if (stream) expect(await response.text()).toBe(payload)
      else expect(await response.json()).toEqual({ type: 'message_stop' })
    }
  )

  it('retargets endpoint, credential, and model without replacing the loopback connection', async () => {
    const first = createUpstream()
    const second = createUpstream()
    servers.push(first.server, second.server)
    const targets: OpenAiProviderBridgeTarget[] = [
      {
        id: 'provider-a/model-a',
        wire: 'chat-completions',
        endpoint: `${await listen(first.server)}/v1/chat/completions`,
        key: 'key-a',
        model: 'model-a'
      },
      {
        id: 'provider-b/model-b',
        wire: 'chat-completions',
        endpoint: `${await listen(second.server)}/custom/chat/completions`,
        key: 'key-b',
        model: 'model-b'
      }
    ]
    const bridge = new OpenAiProviderBridge(targets, targets[0].id)
    bridges.push(bridge)
    const connection = await bridge.start()

    const send = (model: string): Promise<Response> =>
      fetch(`${connection.baseUrl}/v1/chat/completions?ignored=1`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${connection.token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ model, messages: [] })
      })

    await expect((await send('untrusted-model')).json()).resolves.toEqual({ model: 'model-a' })
    expect(bridge.setTarget(targets[1].id)).toBe(true)
    await expect((await send('still-untrusted')).json()).resolves.toEqual({ model: 'model-b' })

    expect(first.requests).toEqual([
      {
        authorization: 'Bearer key-a',
        body: { model: 'model-a', messages: [] },
        path: '/v1/chat/completions'
      }
    ])
    expect(second.requests).toEqual([
      {
        authorization: 'Bearer key-b',
        body: { model: 'model-b', messages: [] },
        path: '/custom/chat/completions'
      }
    ])
  })

  it('forwards the Responses wire and fails closed for other paths and unknown targets', async () => {
    const upstream = createUpstream()
    servers.push(upstream.server)
    const target: OpenAiProviderBridgeTarget = {
      id: 'provider/model-a',
      wire: 'responses',
      endpoint: `${await listen(upstream.server)}/v1/responses`,
      key: 'key-a',
      model: 'model-a'
    }
    const bridge = new OpenAiProviderBridge([target], target.id)
    bridges.push(bridge)
    const connection = await bridge.start()

    expect(bridge.setTarget('missing/model')).toBe(false)
    const wrongPath = await fetch(`${connection.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${connection.token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ model: 'ignored', input: [] })
    })
    const response = await fetch(`${connection.baseUrl}/v1/responses`, {
      method: 'POST',
      headers: {
        'x-api-key': connection.token,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ model: 'ignored', input: [] })
    })

    expect(wrongPath.status).toBe(404)
    expect(response.status).toBe(200)
    expect(upstream.requests).toEqual([
      {
        authorization: 'Bearer key-a',
        body: { model: 'model-a', input: [] },
        path: '/v1/responses'
      }
    ])
  })

  it.each([
    [400, { error: { code: 'model_not_found', message: 'synthetic-secret' } }, 'model-not-found'],
    [404, { error: { type: 'model_not_found' } }, 'model-not-found'],
    [400, { error: { type: 'invalid_request_error', message: 'model not found' } }, undefined],
    [403, { error: { type: 'permission_error' } }, 'auth'],
    [404, { error: { type: 'not_found_error' } }, undefined],
    [429, { error: { type: 'rate_limit_error' } }, undefined],
    [500, { error: { type: 'server_error' } }, undefined]
  ] as const)(
    'reports only definitive failure for upstream %s %j',
    async (status, body, category) => {
      const onProviderFailure = vi.fn()
      const target: OpenAiProviderBridgeTarget = {
        id: 'provider/model-a',
        wire: 'responses',
        endpoint: 'https://provider.example.test/v1/responses',
        model: 'model-a',
        onProviderFailure
      }
      const bridge = new OpenAiProviderBridge([target], target.id, async () =>
        Response.json(body, { status })
      )
      bridges.push(bridge)
      const connection = await bridge.start()
      const response = await fetch(`${connection.baseUrl}/v1/responses`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${connection.token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ input: 'hello' })
      })
      expect(response.status).toBe(status >= 429 ? status : 400)
      if (category)
        expect(onProviderFailure).toHaveBeenCalledExactlyOnceWith({
          startedAt: expect.any(Number),
          category,
          status,
          model: 'model-a',
          endpoint: 'responses'
        })
      else expect(onProviderFailure).not.toHaveBeenCalled()
    }
  )

  it('keeps the failed request observer when its target changes during the request', async () => {
    const firstObserver = vi.fn()
    const nextObserver = vi.fn()
    let finish!: (response: Response) => void
    let started!: () => void
    const accepted = new Promise<void>((resolve) => {
      started = resolve
    })
    const targets: OpenAiProviderBridgeTarget[] = ['first', 'next'].map((name, index) => ({
      id: name,
      wire: 'responses',
      endpoint: `https://${name}.example.test/v1/responses`,
      model: `${name}-model`,
      onProviderFailure: index ? nextObserver : firstObserver
    }))
    const bridge = new OpenAiProviderBridge(targets, 'first', async () => {
      started()
      return new Promise((resolve) => {
        finish = resolve
      })
    })
    bridges.push(bridge)
    const connection = await bridge.start()
    const pending = fetch(`${connection.baseUrl}/v1/responses`, {
      method: 'POST',
      headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ input: 'hello' })
    })
    await accepted
    expect(bridge.setTarget('next')).toBe(true)
    finish(Response.json({ error: { type: 'authentication_error' } }, { status: 401 }))
    expect((await pending).status).toBe(400)
    expect(firstObserver).toHaveBeenCalledExactlyOnceWith({
      startedAt: expect.any(Number),
      category: 'auth',
      status: 401,
      model: 'first-model',
      endpoint: 'responses'
    })
    expect(nextObserver).not.toHaveBeenCalled()
  })

  it('preserves the original failure response if health persistence fails', async () => {
    const target: OpenAiProviderBridgeTarget = {
      id: 'provider/model-a',
      wire: 'responses',
      endpoint: 'https://provider.example.test/v1/responses',
      model: 'model-a',
      onProviderFailure: async () => {
        throw new Error('synthetic-secret-in-persistence-error')
      }
    }
    const bridge = new OpenAiProviderBridge([target], target.id, async () =>
      Response.json({ error: { type: 'authentication_error' } }, { status: 401 })
    )
    bridges.push(bridge)
    const connection = await bridge.start()
    const response = await fetch(`${connection.baseUrl}/v1/responses`, {
      method: 'POST',
      headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ input: 'hello' })
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: { type: 'authentication_error' } })
  })

  it('filters Fetch Metadata headers before invoking the upstream fetch', async () => {
    let upstreamHeaders: Headers | undefined
    const fetchImpl: typeof fetch = async (_input, init) => {
      upstreamHeaders = new Headers(init?.headers)
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' }
      })
    }
    const target: OpenAiProviderBridgeTarget = {
      id: 'provider/model-a',
      wire: 'responses',
      endpoint: 'https://provider.example.test/v1/responses',
      key: 'key-a',
      model: 'model-a'
    }
    const bridge = new OpenAiProviderBridge([target], target.id, fetchImpl)
    bridges.push(bridge)
    const connection = await bridge.start()

    const response = await fetch(`${connection.baseUrl}/v1/responses`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${connection.token}`,
        'content-type': 'application/json',
        'sec-fetch-site': 'same-origin',
        'x-request-id': 'request-1',
        'session-id': 'codex-conversation',
        'x-opencode-session': 'opencode-conversation'
      },
      body: JSON.stringify({ model: 'ignored', input: [] })
    })

    expect(response.status).toBe(200)
    expect(upstreamHeaders?.get('sec-fetch-site')).toBeNull()
    expect(upstreamHeaders?.get('x-request-id')).toBe('request-1')
    expect(upstreamHeaders?.get('session-id')).toBe('codex-conversation')
    expect(upstreamHeaders?.get('x-opencode-session')).toBe('opencode-conversation')
  })

  it('replays an identical deterministic provider error without a second upstream request', async () => {
    const onProviderFailure = vi.fn()
    const fetchImpl = vi.fn(async () =>
      Response.json(
        { error: { type: 'authentication_error', message: 'Incorrect API key provided' } },
        { status: 401 }
      )
    )
    const target: OpenAiProviderBridgeTarget = {
      id: 'provider/model-a',
      wire: 'responses',
      endpoint: 'https://provider.example.test/v1/responses',
      key: 'wrong-key',
      onProviderFailure,
      model: 'model-a'
    }
    const bridge = new OpenAiProviderBridge([target], target.id, fetchImpl)
    bridges.push(bridge)
    const connection = await bridge.start()
    const send = (): Promise<Response> =>
      fetch(`${connection.baseUrl}/v1/responses`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${connection.token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ model: 'ignored', input: 'hello' })
      })

    const first = await send()
    const second = await send()

    expect(first.status).toBe(400)
    expect(second.status).toBe(400)
    expect(second.headers.get('x-open-science-upstream-status')).toBe('401')
    await expect(second.json()).resolves.toMatchObject({
      error: { type: 'authentication_error', message: 'Incorrect API key provided' }
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(onProviderFailure).toHaveBeenCalledExactlyOnceWith({
      startedAt: expect.any(Number),
      category: 'auth',
      status: 401,
      model: 'model-a',
      endpoint: 'responses'
    })
  })

  it('labels a bounded fallback error as JSON on the first response and replay', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('oversized', {
          status: 401,
          headers: {
            'content-encoding': 'gzip',
            'content-length': String(256 * 1024 + 1),
            'content-type': 'text/event-stream'
          }
        })
    )
    const target: OpenAiProviderBridgeTarget = {
      id: 'provider/model-a',
      wire: 'responses',
      endpoint: 'https://provider.example.test/v1/responses',
      key: 'wrong-key',
      model: 'model-a'
    }
    const bridge = new OpenAiProviderBridge([target], target.id, fetchImpl)
    bridges.push(bridge)
    const connection = await bridge.start()
    const send = (): Promise<Response> =>
      fetch(`${connection.baseUrl}/v1/responses`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${connection.token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ model: 'ignored', input: 'hello' })
      })

    for (const response of [await send(), await send()]) {
      expect(response.headers.get('content-type')).toBe('application/json')
      expect(response.headers.get('content-encoding')).toBeNull()
      await expect(response.json()).resolves.toMatchObject({
        error: { message: 'Provider request failed with status 401' }
      })
    }
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('does not replay an error after an upstream-visible request header changes', async () => {
    const fetchImpl = vi.fn(async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      return headers.get('x-provider-feature') === 'invalid'
        ? Response.json({ error: { message: 'Invalid feature' } }, { status: 400 })
        : Response.json({ output: [], model: 'model-a' })
    })
    const target: OpenAiProviderBridgeTarget = {
      id: 'provider/model-a',
      wire: 'responses',
      endpoint: 'https://provider.example.test/v1/responses',
      key: 'key-a',
      model: 'model-a'
    }
    const bridge = new OpenAiProviderBridge([target], target.id, fetchImpl)
    bridges.push(bridge)
    const connection = await bridge.start()
    const send = (feature?: string): Promise<Response> =>
      fetch(`${connection.baseUrl}/v1/responses`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${connection.token}`,
          'content-type': 'application/json',
          ...(feature ? { 'x-provider-feature': feature } : {})
        },
        body: JSON.stringify({ model: 'ignored', input: 'hello' })
      })

    expect((await send('invalid')).status).toBe(400)
    expect((await send()).status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('keeps retryable 429 responses out of the deterministic replay cache', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ error: { message: 'Rate limited' } }, { status: 429 })
    )
    const target: OpenAiProviderBridgeTarget = {
      id: 'provider/model-a',
      wire: 'responses',
      endpoint: 'https://provider.example.test/v1/responses',
      key: 'key-a',
      model: 'model-a'
    }
    const bridge = new OpenAiProviderBridge([target], target.id, fetchImpl)
    bridges.push(bridge)
    const connection = await bridge.start()
    const send = (): Promise<Response> =>
      fetch(`${connection.baseUrl}/v1/responses`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${connection.token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ model: 'ignored', input: 'hello' })
      })

    expect((await send()).status).toBe(429)
    expect((await send()).status).toBe(429)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('refuses the opaque OpenCode MCP image fixture at the final Chat boundary', async () => {
    const upstream = createUpstream()
    servers.push(upstream.server)
    const target: OpenAiProviderBridgeTarget = {
      id: 'provider/model-a',
      wire: 'chat-completions',
      endpoint: `${await listen(upstream.server)}/v1/chat/completions`,
      key: 'key-a',
      model: 'model-a'
    }
    const bridge = new OpenAiProviderBridge([target], target.id)
    bridges.push(bridge)
    const connection = await bridge.start()
    const response = await fetch(`${connection.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        ...OPENCODE_TOOL_IMAGE_REQUEST_FIXTURE,
        model: 'untrusted'
      })
    })

    expect(response.ok).toBe(false)
    expect(upstream.requests).toEqual([])
  })

  it('still refuses opaque media after a CodeBuddy request adapter', async () => {
    const upstream = createUpstream()
    servers.push(upstream.server)
    const target: OpenAiProviderBridgeTarget = {
      id: 'codebuddy/provider/model-a',
      wire: 'chat-completions',
      endpoint: `${await listen(upstream.server)}/v1/chat/completions`,
      key: 'key-a',
      model: 'model-a',
      adaptRequest: adaptCodeBuddyChatCompletionsRequest
    }
    const bridge = new OpenAiProviderBridge([target], target.id)
    bridges.push(bridge)
    const connection = await bridge.start()
    const response = await fetch(`${connection.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'untrusted',
        messages: [
          {
            role: 'user',
            content:
              'Earlier image.\n<image_local_path>/data/clipboard-images/clipboard-2026-08-27T12-02-12-366Z-c876a6d7.png</image_local_path>'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '<image_local_path>/data/clipboard-images/clipboard-2026-08-27T12-02-12-366Z-c876a6d7.png</image_local_path>'
              },
              { type: 'image_url', image_url: { url: 'data:image/png;base64,AQID' } }
            ]
          }
        ]
      })
    })

    expect(response.ok).toBe(false)
    expect(upstream.requests).toEqual([])
  })
})

it('refuses a persisted remote HTTP target before forwarding a prompt or credential', async () => {
  const upstream = vi.fn<typeof fetch>(async () => new Response('{}'))
  const bridge = new OpenAiProviderBridge(
    [
      {
        id: 'legacy',
        wire: 'chat-completions',
        endpoint: 'http://remote-gateway.invalid/v1/chat/completions',
        key: 'PRIVATE_KEY_CANARY',
        model: 'test-model'
      }
    ],
    'legacy',
    upstream
  )
  const connection = await bridge.start()
  try {
    const response = await fetch(`${connection.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'PRIVATE_RESEARCH_CANARY' }] })
    })
    expect(upstream).not.toHaveBeenCalled()
    expect(response.ok).toBe(false)
    expect(await response.text()).toContain('HTTPS')
  } finally {
    await bridge.close()
  }
})

// #159: a PHI refusal is a decision about the request itself, so the loopback must answer 400. As 502 the
// agent CLI read it as a transient gateway failure and re-sent the same refused body 30 times in 25.5 s
// before the user saw anything.
it('answers a PHI refusal with 400 so the client stops after one attempt', async () => {
  installMachineApproval(null)
  installPhiGate(createVaultBackedGate(createMemoryPhiVault()))
  const upstream = vi.fn<typeof fetch>(async () => new Response('{}'))
  const bridge = new OpenAiProviderBridge(
    [
      {
        id: 'phi',
        wire: 'responses',
        endpoint: 'https://gateway.invalid/v1/responses',
        model: 'gpt-5'
      }
    ],
    'phi',
    upstream
  )
  const connection = await bridge.start()
  // The retry set the CLI retries on: 429 and 5xx. 400 is deliberately outside it.
  const retryable = new Set([429, 500, 502, 503, 504])
  try {
    let attempts = 0
    let status = 0
    let body: { error?: { type?: string; message?: string } } = {}
    do {
      attempts += 1
      const response = await fetch(`${connection.baseUrl}/v1/responses`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${connection.token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-5',
          input: [
            {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: '患者：山田 太郎、保険者番号 02123456' }]
            }
          ]
        })
      })
      status = response.status
      body = (await response.json()) as typeof body
    } while (retryable.has(status) && attempts < 5)

    expect(status).toBe(400)
    // Exactly one attempt: the refusal is deterministic, so nothing is resent.
    expect(attempts).toBe(1)
    // The client's error type, not "api_error" (the transient-upstream class).
    expect(body.error?.type).toBe('invalid_request_error')
    // The user-facing reason travels with it, and never the matched text.
    expect(body.error?.message).toContain('PHI-BLOCK-01')
    expect(body.error?.message).not.toContain('山田')
    expect(body.error?.message).not.toContain('02123456')
    // Nothing left the machine.
    expect(upstream).not.toHaveBeenCalled()
  } finally {
    installMachineApproval(null)
    installPhiGate({
      release: (text) => ({ text, replacements: [], warnings: [] }),
      restore: (text) => text
    })
    await bridge.close()
  }
})

// #251: beta.23's failing turn reported
//   `unexpected status 502 Bad Gateway: fetch failed, url: http://127.0.0.1:62627/v1/responses`
// The 502 is this bridge wrapping its own upstream fetch failure, and undici's cause — the only signal
// that separates a body timeout from a reset or a DNS failure — used to be dropped. These pin the log
// fields and the human sentence; they deliberately do not pin a timeout value (that waits for the
// cause evidence this change starts recording).
describe('provider failure diagnostics (#251)', () => {
  const servers: Server[] = []
  const bridges: OpenAiProviderBridge[] = []
  let logDir: string

  beforeEach(async () => {
    installMachineApproval(() => true)
    installPhiGate({
      release: (text) => ({ text, replacements: [], warnings: [] }),
      restore: (text) => text
    })
    logDir = await mkdtemp(join(tmpdir(), 'openai-bridge-log-'))
    initLogger({ logDir, mirrorToConsole: false })
  })

  afterEach(async () => {
    await Promise.all(bridges.splice(0).map((bridge) => bridge.close()))
    await Promise.all(servers.splice(0).map(close))
    await flushLogs()
    await rm(logDir, { recursive: true, force: true })
    installMachineApproval(null)
    installPhiGate({
      release: (text) => ({ text, replacements: [], warnings: [] }),
      restore: (text) => text
    })
  })

  const logText = async (): Promise<string> => {
    await flushLogs()
    return readFile(join(logDir, 'main.log'), 'utf8')
  }

  const startBridge = async (
    fetchImpl: typeof fetch
  ): Promise<{ baseUrl: string; token: string }> => {
    const target: OpenAiProviderBridgeTarget = {
      id: 'diagnostics',
      wire: 'responses',
      endpoint: 'https://gateway.invalid/v1/responses',
      model: 'gpt-5'
    }
    const bridge = new OpenAiProviderBridge([target], target.id, fetchImpl)
    bridges.push(bridge)
    const connection = await bridge.start()
    return { baseUrl: connection.baseUrl, token: connection.token }
  }

  const post = (baseUrl: string, token: string, body: unknown): Promise<Response> =>
    fetch(`${baseUrl}/v1/responses`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })

  it.each([
    [
      'UND_ERR_BODY_TIMEOUT',
      'The model service stopped sending data before the reply finished. Retry the request.'
    ],
    ['UND_ERR_HEADERS_TIMEOUT', 'The model service did not respond in time. Retry the request.'],
    [
      'ECONNRESET',
      'Could not reach the model service. Check your network, proxy or VPN, then retry.'
    ]
  ])('logs %s and answers an actionable sentence', async (code, sentence) => {
    const upstream = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed', {
        cause: Object.assign(new Error('private upstream detail'), { code })
      })
    })
    const { baseUrl, token } = await startBridge(upstream)
    const response = await post(baseUrl, token, {
      model: 'gpt-5',
      input: 'BODY-CANARY-DO-NOT-LOG'
    })
    expect(response.status).toBe(502)
    const body = (await response.json()) as { error?: { message?: string; code?: string } }
    expect(body.error?.message).toBe(sentence)
    // The response code is unchanged: this failure never carried one.
    expect(body.error?.code).toBeUndefined()

    const log = await logText()
    expect(log).toContain('provider request failed')
    expect(log).toContain(`"causeCode":"${code}"`)
    expect(log).toContain('"responseStarted":false')
    expect(log).toContain('"durationMs":')
    expect(log).not.toContain('BODY-CANARY-DO-NOT-LOG')
    // The error message can carry a path or a provider sentence; only its presence is recorded.
    expect(log).not.toContain('private upstream detail')
    // The target's endpoint is a private gateway URL (`https://gateway.invalid/...`). `path` in this
    // line is the local wire path (`/v1/responses`), whose value domain is checked by `WIRE_PATH[wire]`
    // — never the upstream URL — so a URL-shaped canary has to stay out of the log.
    expect(log).not.toContain('gateway.invalid')
  })

  it('marks a failure after the first byte as a stream interruption', async () => {
    const upstreamServer = createServer((request, response) => {
      request.resume()
      request.on('end', () => {
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.write('data: first\n\n')
        setImmediate(() => response.destroy())
      })
    })
    servers.push(upstreamServer)
    const target: OpenAiProviderBridgeTarget = {
      id: 'stream-failure',
      wire: 'responses',
      endpoint: `${await listen(upstreamServer)}/v1/responses`,
      model: 'gpt-5'
    }
    const bridge = new OpenAiProviderBridge(
      [target],
      target.id,
      nodeFetch as unknown as typeof fetch
    )
    bridges.push(bridge)
    const connection = await bridge.start()
    await post(connection.baseUrl, connection.token, { model: 'gpt-5', input: 'hello' }).then(
      async (response) => {
        expect(response.status).toBe(200)
        await response.text().catch(() => undefined)
      },
      () => undefined
    )
    await vi.waitFor(async () => {
      expect(await logText()).toContain('provider request failed')
    })
    const log = await logText()
    expect(log).toContain('"responseStarted":true')
    expect(log).toContain('"phase":"stream"')
  })
})
