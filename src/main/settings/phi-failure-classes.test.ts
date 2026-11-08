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
import { OpenAiProviderBridge } from './openai-provider-bridge'
import {
  PHI_BLOCK_CODE,
  PHI_CONSENT_CODE,
  PHI_INTERNAL_CODE,
  PHI_REVIEW_UNAVAILABLE_CODE,
  PHI_TURN_REPLACED_CODE,
  PHI_UNAVAILABLE_CODE,
  PHI_UNSCANNABLE_CODE
} from '../../shared/phi-block'
import { phiErrorResponse, statusForPhiError } from './provider-loopback-http-host'

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

  it('names an unmapped code instead of collapsing it to a bare 500', () => {
    // The only source that can grow the table is the string itself: 500 alone would tell the next
    // reader nothing about which code is missing.
    const error = new PhiGateError('x', [], 'PHI-FUTURE-01' as never)
    expect(statusForPhiError(error)).toEqual({ status: 500, code: 'PHI-FUTURE-01' })
    expect(phiErrorResponse(error, 'fallback').body.error.code).toBe('PHI-FUTURE-01')
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
