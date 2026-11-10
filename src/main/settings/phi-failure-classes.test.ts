import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createVaultBackedGate,
  installMachineApproval,
  installPhiConfirmer,
  installPhiGate,
  PhiGateError
} from '../phi/gate'
import { createMemoryPhiVault } from '../phi/store'
import { NativeResponsesCompatibilityProxy } from './native-responses-compatibility'
import { OpenAiProviderBridge } from './openai-provider-bridge'
import { ResponsesBridge } from './responses-bridge'
import {
  PHI_BLOCK_CODE,
  PHI_CONSENT_CODE,
  PHI_INTERNAL_CODE,
  PHI_REVIEW_UNAVAILABLE_CODE,
  PHI_TURN_REPLACED_CODE,
  PHI_UNAVAILABLE_CODE,
  PHI_UNSCANNABLE_CODE
} from '../../shared/phi-block'
import { phiErrorResponse, phiErrorType, statusForPhiError } from './provider-loopback-http-host'

// #195: the transport answer is decided by the refusal class, and the client's retry loop is the thing
// under test - not a mocked status. Each case drives the real bridge and the real retry set the agent
// CLI uses (429 and 5xx), so "would resending help?" is answered by behaviour: A/B/D stop after one
// attempt, C1 is retried, E is retried but never claims the request was checked.
const RETRYABLE = new Set([429, 500, 502, 503, 504])

const providerTarget = [
  {
    id: 'phi',
    wire: 'responses' as const,
    endpoint: 'https://gateway.invalid/v1/responses',
    model: 'gpt-5'
  }
]

type FailureBody = { error?: { type?: string; message?: string; code?: string } }

const attempt = async (
  connection: { baseUrl: string; token: string },
  body: unknown
): Promise<{ status: number; body: FailureBody; attempts: number }> => {
  let attempts = 0
  let status = 0
  let parsed: FailureBody = {}
  do {
    attempts += 1
    const response = await fetch(`${connection.baseUrl}/v1/responses`, {
      method: 'POST',
      headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    status = response.status
    parsed = (await response.json()) as FailureBody
  } while (RETRYABLE.has(status) && attempts < 5)
  return { status, body: parsed, attempts }
}

type StubGate = {
  release: (value: string) => {
    text: string
    replacements: Array<{ category: 'PERSON_NAME'; original: string; replacement: string }>
    warnings: string[]
  }
  restore: (value: string) => string
  highlights: (value: string) => Array<{ start: number; end: number; category: 'PERSON_NAME' }>
}

const acceptedByGate = (text: string): StubGate => ({
  release: (value: string) => ({
    text: value,
    replacements:
      value === text
        ? [
            {
              category: 'PERSON_NAME' as const,
              original: value,
              replacement: '[患者名1]'
            }
          ]
        : [],
    warnings: []
  }),
  restore: (value: string) => value,
  // The reviewed text is the released JSON, so the mark has to point inside it. The window still
  // only opens because the released string contains the marked text.
  highlights: (value: string) => {
    const at = value.indexOf(text)
    return at === -1 ? [] : [{ start: at, end: at + text.length, category: 'PERSON_NAME' as const }]
  }
})

afterEach(() => {
  installPhiConfirmer(null)
  installMachineApproval(null)
  installPhiGate(createVaultBackedGate(createMemoryPhiVault()))
})

describe('refusal classes reach the transport as the retry advice they mean', () => {
  it('A: patient information is found, answered 400 and never resent', async () => {
    installMachineApproval(null)
    installPhiGate(createVaultBackedGate(createMemoryPhiVault()))
    const upstream = vi.fn<typeof fetch>(async () => new Response('{}'))
    const bridge = new OpenAiProviderBridge(providerTarget, 'phi', upstream)
    const connection = await bridge.start()
    try {
      // A labelled patient span, not a guess: the short-query heuristic is a different path.
      const result = await attempt(connection, {
        model: 'gpt-5',
        input: [
          {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: '患者：山田 太郎、保険者番号 02123456' }]
          }
        ]
      })
      expect(result.status).toBe(400)
      expect(result.attempts).toBe(1)
      expect(result.body.error?.code).toBe(PHI_BLOCK_CODE)
      expect(upstream).not.toHaveBeenCalled()
    } finally {
      await bridge.close()
    }
  })

  it('B: content that can never be checked is 400, once, and names the class', async () => {
    const upstream = vi.fn<typeof fetch>(async () => new Response('{}'))
    const bridge = new OpenAiProviderBridge(providerTarget, 'phi', upstream)
    const connection = await bridge.start()
    try {
      const result = await attempt(connection, {
        model: 'gpt-5',
        input: [
          {
            type: 'message',
            role: 'user',
            content: [{ type: 'image_url', image_url: 'data:image/png;base64,AAAA' }]
          }
        ]
      })
      expect(result.status).toBe(400)
      expect(result.attempts).toBe(1)
      expect(result.body.error?.code).toBe(PHI_UNSCANNABLE_CODE)
      expect(upstream).not.toHaveBeenCalled()
    } finally {
      await bridge.close()
    }
  })

  it('C1: an unavailable policy engine is retryable, and the request still never leaves', async () => {
    installPhiGate(null)
    const upstream = vi.fn<typeof fetch>(async () => new Response('{}'))
    const bridge = new OpenAiProviderBridge(providerTarget, 'phi', upstream)
    const connection = await bridge.start()
    try {
      const result = await attempt(connection, {
        model: 'gpt-5',
        input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hello' }] }]
      })
      expect(result.status).toBe(503)
      expect(result.body.error?.code).toBe(PHI_UNAVAILABLE_CODE)
      // The client's retry loop kept going: this class says "later may be different".
      expect(result.attempts).toBeGreaterThan(1)
      expect(upstream).not.toHaveBeenCalled()
    } finally {
      await bridge.close()
    }
  })

  it('D: a cancelled review is 400, once - retrying would only reopen the window', async () => {
    const confirmer = vi.fn(async () => ({ confirmed: false as const }))
    installPhiGate(acceptedByGate('hello'))
    installPhiConfirmer(confirmer)
    const upstream = vi.fn<typeof fetch>(async () => new Response('{}'))
    const bridge = new OpenAiProviderBridge(providerTarget, 'phi', upstream)
    const connection = await bridge.start()
    try {
      const result = await attempt(connection, {
        model: 'gpt-5',
        input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hello' }] }]
      })
      expect(result.status).toBe(400)
      expect(result.attempts).toBe(1)
      expect(result.body.error?.code).toBe(PHI_CONSENT_CODE)
      // One request, one window: the 400 is what stops the client from opening it again.
      expect(confirmer).toHaveBeenCalledTimes(1)
      expect(upstream).not.toHaveBeenCalled()
    } finally {
      await bridge.close()
    }
  })

  it('E: a broken gate contract is 409, once, and never claims the content was checked', async () => {
    installPhiGate({
      release: () => ({ text: 42 as unknown as string, replacements: [], warnings: [] }),
      restore: (value: string) => value
    })
    const upstream = vi.fn<typeof fetch>(async () => new Response('{}'))
    const bridge = new OpenAiProviderBridge(providerTarget, 'phi', upstream)
    const connection = await bridge.start()
    try {
      const result = await attempt(connection, {
        model: 'gpt-5',
        input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hello' }] }]
      })
      expect(result.status).toBe(409)
      // 409 is outside the client's retry set: retrying would replay the gate, and after a review that
      // can reopen the window the user already left.
      expect(result.attempts).toBe(1)
      expect(result.body.error?.code).toBe(PHI_INTERNAL_CODE)
      expect(result.body.error?.message).not.toMatch(/vault|\\|[A-Z]:\\/i)
      expect(upstream).not.toHaveBeenCalled()
    } finally {
      await bridge.close()
    }
  })

  it('names an unmapped code and keeps it out of the retry set', () => {
    // A code we minted but never classified is an internal inconsistency, not a foreign error: 409,
    // never 500 (retried) and never a bare status. The code string is the only signal that can grow
    // the table.
    const error = new PhiGateError('x', [], 'PHI-FUTURE-01' as never)
    expect(statusForPhiError(error)).toEqual({ status: 409, code: 'PHI-FUTURE-01' })
    expect(phiErrorResponse(error, 'fallback').body.error.code).toBe('PHI-FUTURE-01')
  })

  // The Responses wire had its own mapping until #195 and is now covered by the shared one. Drive it
  // through the real host: a structural guard ("the file mentions phiErrorResponse") does not prove the
  // branch behaves.
  const responsesWire = async () => {
    const upstream = vi.fn<typeof fetch>(async () => new Response('{}'))
    const bridge = new ResponsesBridge(
      { baseUrl: 'https://opencode.ai/zen/go/v1', vendorId: 'opencode-go' },
      upstream
    )
    const connection = await bridge.start()
    const send = (body: unknown) =>
      fetch(`${connection.baseUrl}/responses`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${connection.token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify(body)
      })
    return { bridge, upstream, send }
  }

  it('C1 through the Responses wire is 503, not 400', async () => {
    installPhiGate(null)
    const { bridge, upstream, send } = await responsesWire()
    try {
      const response = await send({ input: 'hello', stream: false, prompt_cache_key: 'session-1' })
      expect(response.status).toBe(503)
      expect(await response.json()).toMatchObject({
        error: { code: PHI_UNAVAILABLE_CODE }
      })
      expect(upstream).not.toHaveBeenCalled()
    } finally {
      await bridge.close()
    }
  })

  it('a block through the Responses wire is 400 with PHI-BLOCK-01', async () => {
    installMachineApproval(null)
    installPhiGate(createVaultBackedGate(createMemoryPhiVault()))
    const { bridge, upstream, send } = await responsesWire()
    try {
      const response = await send({
        input: '患者：山田 太郎、保険者番号 02123456',
        stream: false,
        prompt_cache_key: 'session-2'
      })
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ error: { code: PHI_BLOCK_CODE } })
      expect(upstream).not.toHaveBeenCalled()
    } finally {
      await bridge.close()
    }
  })

  // E's body: a 409 is still a client error, while 503 stays in the "transient upstream" class the
  // client reads as api_error. Without this table the next person can flip one ternary and stay green.
  it.each([
    [PHI_BLOCK_CODE, 400, 'invalid_request_error'],
    [PHI_INTERNAL_CODE, 409, 'invalid_request_error'],
    ['PHI-FUTURE-01', 409, 'invalid_request_error'],
    [PHI_REVIEW_UNAVAILABLE_CODE, 409, 'invalid_request_error'],
    [PHI_UNAVAILABLE_CODE, 503, 'api_error']
  ])('%s travels as %i with type %s', (code, status, type) => {
    const error = new PhiGateError('refused', [], code as never)
    const response = phiErrorResponse(error, 'fallback')
    expect(response.status).toBe(status)
    expect(response.body.error.type).toBe(type)
    expect(response.body.error.code).toBe(code)
  })

  it('never maps a phi failure to 500, because the client retries 5xx', () => {
    for (const code of [
      PHI_BLOCK_CODE,
      PHI_UNSCANNABLE_CODE,
      PHI_CONSENT_CODE,
      PHI_TURN_REPLACED_CODE,
      PHI_INTERNAL_CODE,
      PHI_REVIEW_UNAVAILABLE_CODE,
      PHI_UNAVAILABLE_CODE,
      'PHI-FUTURE-01'
    ]) {
      expect(statusForPhiError(new PhiGateError('x', [], code as never)).status, code).not.toBe(500)
    }
    // A non-PHI error is a different question: it is not a refusal, so it keeps the transport's 502.
    expect(statusForPhiError(new Error('upstream timed out'))).toEqual({ status: 502 })
  })

  it('an unmapped code reaches the wire as 409 and is not resent', async () => {
    // No production path mints this code, so the function table alone would leave it on paper. The wire
    // proves the whole chain: a gate error escapes escalateReleaseFailure unchanged, the transport maps
    // it, and 409 keeps the client from replaying the gate.
    installPhiGate({
      release: () => {
        throw new PhiGateError('x', [], 'PHI-FUTURE-01' as never)
      },
      restore: (value: string) => value
    })
    const upstream = vi.fn<typeof fetch>(async () => new Response('{}'))
    const bridge = new OpenAiProviderBridge(providerTarget, 'phi', upstream)
    const connection = await bridge.start()
    try {
      const result = await attempt(connection, {
        model: 'gpt-5',
        input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hello' }] }]
      })
      expect(result.status).toBe(409)
      expect(result.attempts).toBe(1)
      expect(result.body.error?.code).toBe('PHI-FUTURE-01')
      expect(upstream).not.toHaveBeenCalled()
    } finally {
      await bridge.close()
    }
  })

  it('does not treat an unclassified error as a refusal', () => {
    expect(statusForPhiError(new Error('upstream timed out'))).toEqual({ status: 502 })
    expect(statusForPhiError({})).toEqual({ status: 502 })
  })
})

// CTO review: consolidating the mapping is only worth it if the call sites cannot drift apart again.
// The six-bridge future is the risk - a new bridge copying `? 400 : 502` would silently restore the
// #159 behaviour for its wire.
describe('every bridge reads the one mapping', () => {
  const directory = join(process.cwd(), 'src/main/settings')
  const sources = readdirSync(directory).filter(
    (name) => name.endsWith('.ts') && !name.includes('.test.')
  )
  // Behaviour, not filenames (#212): a bridge is anything that imports or constructs the loopback host.
  // The filename pattern this guard started with would have missed responses-bridge.ts, which had its
  // own mapping; a future `foo-gateway.ts` is exactly the same shape of miss.
  const bridges = sources.filter((name) => {
    if (name === 'provider-loopback-http-host.ts') return false
    const text = readFileSync(join(directory, name), 'utf8')
    return (
      text.includes("from './provider-loopback-http-host'") ||
      text.includes('ProviderLoopbackHttpHost')
    )
  })

  it('finds the bridges by behaviour, including the one the filename pattern missed', () => {
    expect(bridges).toContain('responses-bridge.ts')
    for (const name of [
      'anthropic-provider-bridge.ts',
      'chat-provider-compatibility.ts',
      'native-responses-compatibility.ts',
      'openai-provider-bridge.ts',
      'xai-oauth-provider-bridge.ts'
    ])
      expect(bridges, name).toContain(name)
  })

  it('has no bridge left with its own status ternary', () => {
    // Normalise whitespace so a ternary split across lines is found too.
    const leftovers = bridges.filter((name) =>
      readFileSync(join(directory, name), 'utf8').replace(/\s+/g, '').includes('?400:502')
    )
    expect(leftovers).toEqual([])
  })

  it('routes every bridge through statusForPhiError or phiErrorResponse', () => {
    const missing = bridges.filter((name) => {
      const text = readFileSync(join(directory, name), 'utf8')
      return !text.includes('phiErrorResponse(') && !text.includes('statusForPhiError(')
    })
    expect(missing).toEqual([])
  })
})

// The codes themselves are part of the contract: the transport table must not silently drop one.
describe('refusal codes keep their retry semantics', () => {
  it.each([
    [PHI_BLOCK_CODE, 400],
    [PHI_UNSCANNABLE_CODE, 400],
    [PHI_CONSENT_CODE, 400],
    [PHI_TURN_REPLACED_CODE, 400],
    [PHI_UNAVAILABLE_CODE, 503],
    [PHI_REVIEW_UNAVAILABLE_CODE, 409],
    [PHI_INTERNAL_CODE, 409]
  ])('%s maps to %i', (code, status) => {
    expect(statusForPhiError(new PhiGateError('refused', [], code))).toEqual({ status, code })
  })
})

// #227: the status -> `type` rule lived as the same ternary in two bridges, so one could be edited
// without the other. It is one function now, and the table below is what pins both ends of the split.
describe('phi error type is one rule', () => {
  it.each([
    [400, 'invalid_request_error'],
    [409, 'invalid_request_error'],
    [503, 'api_error'],
    [502, 'api_error']
  ])('%i travels as %s', (status, type) => {
    expect(phiErrorType(status)).toBe(type)
  })

  it('leaves no bridge with its own status -> type ternary', () => {
    const directory = join(process.cwd(), 'src/main/settings')
    const normalised = (name: string) =>
      readFileSync(join(directory, name), 'utf8').replace(/\s+/g, '')
    const leftovers = readdirSync(directory)
      .filter((name) => name.endsWith('.ts') && !name.includes('.test.'))
      // The one home of the rule is allowed to hold the ternary; every other file must call it.
      .filter((name) => name !== 'provider-loopback-http-host.ts')
      .filter((name) => {
        const text = normalised(name)
        return (
          text.includes("status<500?'invalid_request_error':'api_error'") ||
          text.includes('status<500?"invalid_request_error":"api_error"')
        )
      })
    expect(leftovers).toEqual([])
  })

  // The wire proof matters here for the same reason as the unmapped-code case: a function table alone
  // would leave "this bridge actually uses it" on paper. This drives the native Responses proxy, which
  // is the second call site and the one no PR job covers by its own directory.
  it('the native Responses wire answers a phi refusal with 409 and a client type', async () => {
    installPhiGate({
      release: () => {
        throw new PhiGateError('x', [], PHI_INTERNAL_CODE)
      },
      restore: (value: string) => value
    })
    const upstream = vi.fn<typeof fetch>(async () => new Response('{}'))
    const proxy = new NativeResponsesCompatibilityProxy(
      { baseUrl: 'https://provider.example.test/v1', key: 'key-a', model: 'model-a' },
      upstream
    )
    const connection = await proxy.start()
    try {
      const response = await fetch(`${connection.baseUrl}/responses`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${connection.token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ input: 'hello' })
      })
      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toMatchObject({
        error: { type: 'invalid_request_error', code: PHI_INTERNAL_CODE }
      })
      expect(upstream).not.toHaveBeenCalled()
    } finally {
      await proxy.close()
    }
  })

  // #227 second half: the synthesised provider-error body. The ticket expected an upstream 5xx to be
  // reported as a 5xx with a client-error type. It cannot: that branch is gated on the deterministic
  // 4xx set, and providerErrorClientStatus maps every one of those to 400. Two cases pin both sides of
  // that fact, so a future widening of the gate cannot silently produce a 5xx + client-error pair.
  const acceptingGate = () =>
    installPhiGate({
      release: (value: string) => ({ text: value, replacements: [], warnings: [] }),
      restore: (value: string) => value
    })

  const askProxy = async (upstreamResponse: Response) => {
    acceptingGate()
    const upstream = vi.fn<typeof fetch>(async () => upstreamResponse)
    const proxy = new NativeResponsesCompatibilityProxy(
      { baseUrl: 'https://provider.example.test/v1', key: 'key-a', model: 'model-a' },
      upstream
    )
    const connection = await proxy.start()
    try {
      const response = await fetch(`${connection.baseUrl}/responses`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${connection.token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ input: 'hello' })
      })
      return { status: response.status, body: await response.json() }
    } finally {
      await proxy.close()
    }
  }

  it('synthesises a client error whose type matches the 400 it sends', async () => {
    const { status, body } = await askProxy(
      // 404 is deterministic, but the body is not JSON, so it cannot be replayed and we synthesise one.
      new Response('not json at all', {
        status: 404,
        headers: { 'content-type': 'application/json' }
      })
    )
    expect(status).toBe(400)
    expect(body).toMatchObject({ error: { type: 'invalid_request_error', status: 404 } })
  })

  it('never synthesises that body for an upstream 5xx', async () => {
    const { status, body } = await askProxy(
      Response.json(
        { error: { type: 'server_error', message: 'upstream exploded' } },
        { status: 503 }
      )
    )
    // A 5xx is replayed verbatim: our client-error shape (with its `status` field) must not appear.
    expect(status).toBe(503)
    expect(body).toEqual({ error: { type: 'server_error', message: 'upstream exploded' } })
  })
})

// #243: the packaged app holds two copies of the gate class (the backend bundle produces the refusal,
// the bridge checks its own copy), so `instanceof` is false for a real refusal. These tests build the
// refusal the way that boundary actually delivers it - same name, same `PHI-*` code, same message, a
// different class - and assert the outbound answer, not that some function was called.
class ForeignGateError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'PhiGateError'
    this.code = code
  }
}

const foreignRefusal = (code: string, message = 'refused at the gate') =>
  new ForeignGateError(code, message)

describe('a refusal is recognised by its stable code, not by its class', () => {
  it('serves a foreign refusal exactly like our own class does', () => {
    for (const code of [
      PHI_BLOCK_CODE,
      PHI_UNSCANNABLE_CODE,
      PHI_CONSENT_CODE,
      PHI_TURN_REPLACED_CODE,
      PHI_INTERNAL_CODE,
      PHI_REVIEW_UNAVAILABLE_CODE,
      PHI_UNAVAILABLE_CODE
    ]) {
      const own = statusForPhiError(new PhiGateError('refused', [], code as never))
      const foreign = statusForPhiError(foreignRefusal(code))
      expect(foreign, code).toEqual(own)
      expect(foreign.status, code).not.toBe(502)
    }
  })

  it('does not read a non-PHI error as a refusal', () => {
    expect(statusForPhiError(new Error('upstream timed out'))).toEqual({ status: 502 })
    expect(statusForPhiError({ code: 'ECONNRESET' })).toEqual({ status: 502 })
    expect(statusForPhiError({ code: 'PHI-NOT-A-REAL-CODE' }).status).toBe(409)
  })

  it('the native Responses wire answers a foreign PHI-BLOCK-01 with 400 and its code', async () => {
    // This is the #243 incident: a refusal crossed the bundle boundary, `instanceof` failed, and the
    // client was told 502 Bad Gateway with no code.
    installPhiGate({
      release: () => {
        throw foreignRefusal(PHI_BLOCK_CODE)
      },
      restore: (value: string) => value
    })
    const upstream = vi.fn<typeof fetch>(async () => new Response('{}'))
    const proxy = new NativeResponsesCompatibilityProxy(
      { baseUrl: 'https://provider.example.test/v1', key: 'key-a', model: 'model-a' },
      upstream
    )
    const connection = await proxy.start()
    try {
      const response = await fetch(`${connection.baseUrl}/responses`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${connection.token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ input: 'hello' })
      })
      expect(response.status).toBe(400)
      const body = (await response.json()) as {
        error?: { type?: string; code?: string; message?: string }
      }
      expect(body.error?.code).toBe(PHI_BLOCK_CODE)
      expect(body.error?.message).toBe('refused at the gate')
      expect(body.error?.type).toBe('invalid_request_error')
      expect(upstream).not.toHaveBeenCalled()
    } finally {
      await proxy.close()
    }
  })

  it('the Responses bridge keeps the code for a foreign refusal too', async () => {
    installPhiGate({
      release: () => {
        throw foreignRefusal(PHI_BLOCK_CODE)
      },
      restore: (value: string) => value
    })
    const upstream = vi.fn<typeof fetch>(async () => new Response('{}'))
    const bridge = new ResponsesBridge(
      { baseUrl: 'https://opencode.ai/zen/go/v1', vendorId: 'opencode-go' },
      upstream
    )
    const connection = await bridge.start()
    try {
      const response = await fetch(`${connection.baseUrl}/responses`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${connection.token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ input: 'hello', stream: false, prompt_cache_key: 'session-1' })
      })
      expect(response.status).toBe(400)
      const body = (await response.json()) as { error?: { code?: string } }
      expect(body.error?.code).toBe(PHI_BLOCK_CODE)
      expect(upstream).not.toHaveBeenCalled()
    } finally {
      await bridge.close()
    }
  })

  // Acceptance #1: the log must name the failure without printing it. A refusal's message can carry
  // the blocked text, so only its presence is recorded - and name/code are the two identifiers that
  // would have ended the #243 investigation in one line.
  it('the failure log names a foreign refusal without printing its text', async () => {
    const { mkdtemp, readFile, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { flushLogs, initLogger } = await import('@aipoch/diagnostics/node')
    const logDir = await mkdtemp(join(tmpdir(), 'phi-243-log-'))
    initLogger({ logDir, mirrorToConsole: false })
    try {
      installPhiGate({
        release: () => {
          throw foreignRefusal(PHI_BLOCK_CODE, 'BLOCKED-TEXT-MARKER 山田 太郎')
        },
        restore: (value: string) => value
      })
      const upstream = vi.fn<typeof fetch>(async () => new Response('{}'))
      const proxy = new NativeResponsesCompatibilityProxy(
        { baseUrl: 'https://provider.example.test/v1', key: 'key-a', model: 'model-a' },
        upstream
      )
      const connection = await proxy.start()
      try {
        const response = await fetch(`${connection.baseUrl}/responses`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${connection.token}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify({ input: 'hello' })
        })
        expect(response.status).toBe(400)
      } finally {
        await proxy.close()
      }

      await flushLogs()
      const log = await readFile(join(logDir, 'main.log'), 'utf8')
      expect(log).toContain('native Responses compatibility request failed')
      expect(log).toContain('PhiGateError')
      expect(log).toContain(PHI_BLOCK_CODE)
      expect(log).toContain('"hasErrorMessage":true')
      expect(log).toContain('"requestAborted":false')
      // The refusal text is served to the client (acceptance #3), never written to the log.
      expect(log).not.toContain('BLOCKED-TEXT-MARKER')
    } finally {
      await flushLogs()
      await rm(logDir, { recursive: true, force: true })
    }
  })
})
