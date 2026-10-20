import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  createVaultBackedGate,
  installMachineApproval,
  installPhiConfirmer,
  installPhiGate
} from '../phi/gate'
import { createMemoryPhiVault } from '../phi/store'
import { fetchProviderRequest } from './provider-fetch'

beforeEach(() => {
  installPhiGate(createVaultBackedGate(createMemoryPhiVault()))
  installMachineApproval(() => true)
})
afterEach(() => {
  installPhiConfirmer(null)
  installMachineApproval(null)
})

it.each(['inherit', 'override', 'undefined'])(
  'preserves Request transport options with init mode=%s',
  async (mode) => {
    const controller = new AbortController()
    const original = new Request('https://provider.invalid/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer FICTIONAL_KEY' },
      body: JSON.stringify({ content: '患者：架空 太郎' }),
      credentials: 'include',
      cache: 'no-store',
      mode: 'same-origin',
      referrer: 'https://provider.invalid/referrer',
      referrerPolicy: 'no-referrer',
      integrity: 'sha256-ZmljdGlvbmFs',
      keepalive: true,
      redirect: 'follow',
      signal: controller.signal
    })
    const overrides: RequestInit =
      mode === 'override'
        ? {
            credentials: 'omit',
            cache: 'reload',
            mode: 'cors',
            referrer: 'https://provider.invalid/override',
            referrerPolicy: 'origin',
            integrity: 'sha256-b3ZlcnJpZGU=',
            keepalive: false,
            redirect: 'error'
          }
        : mode === 'undefined'
          ? {
              credentials: undefined,
              cache: undefined,
              mode: undefined,
              referrer: undefined,
              referrerPolicy: undefined,
              integrity: undefined,
              keepalive: undefined,
              method: undefined,
              headers: undefined,
              signal: undefined
            }
          : {}
    const confirm = vi.fn(async () => ({ confirmed: true }))
    installPhiConfirmer(confirm)
    const send = vi.fn<typeof fetch>(async () => new Response('{}'))
    await fetchProviderRequest(send, original, overrides)
    expect(confirm).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledOnce()
    const [url, init] = send.mock.calls[0]
    // Build the request seen by a real fetch to verify the effective transport semantics.
    const outbound = new Request(url, init)
    for (const option of [
      'credentials',
      'cache',
      'mode',
      'referrer',
      'referrerPolicy',
      'integrity',
      'keepalive'
    ] as const) {
      expect(outbound[option]).toBe(overrides[option] ?? original[option])
    }
    expect(outbound.method).toBe(original.method)
    expect(outbound.headers.get('authorization')).toBe(original.headers.get('authorization'))
    expect(outbound.redirect).toBe('manual')
    expect(await outbound.text()).not.toContain('架空')
    controller.abort()
    expect(init?.signal?.aborted).toBe(true)
    expect(await original.text()).toContain('架空')
  }
)
