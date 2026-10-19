import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRemoteDesktopFileInteraction } from '../desktop-interaction'
import { parseDesktopNativeResult, type DesktopNativeOperation } from '../desktop-native-contract'
import { fetchProviderRequest } from '../settings/provider-fetch'
import { englishNativeTranslator } from '../locale/main-process-messages'
import { createDesktopPhiConfirmer } from './desktop-confirmer'
import {
  createVaultBackedGate,
  installMachineApproval,
  installPhiConfirmer,
  installPhiGate,
  MODEL_RELEASE_TIMEOUT_MS
} from './gate'
import { createMemoryPhiVault } from './store'

const state = vi.hoisted(() => ({ available: true, review: vi.fn() }))
vi.mock('../desktop-interaction', async (original) => ({
  ...(await original<typeof import('../desktop-interaction')>()),
  desktopFileInteraction: () => ({ reviewPhi: state.available ? state.review : undefined })
}))

beforeEach(() => {
  state.available = true
  state.review.mockReset()
  installPhiGate(createVaultBackedGate(createMemoryPhiVault()))
  installMachineApproval(() => true)
  installPhiConfirmer(createDesktopPhiConfirmer(englishNativeTranslator))
})
afterEach(() => {
  vi.useRealTimers()
  installPhiConfirmer(null)
  installMachineApproval(null)
})
const sendRequest = (send: typeof fetch): Promise<Response> =>
  fetchProviderRequest(send, 'https://provider.invalid/v1/messages', {
    method: 'POST',
    body: JSON.stringify({ messages: [{ content: '患者：架空 太郎\nカルテ番号：0098765' }] })
  })

describe('Node model requests require the authenticated desktop review', () => {
  it('validates manual masking marks across the native response boundary', () => {
    const operation = {
      operation: 'phi-review',
      preview: { text: 'review', highlights: [] },
      labels: {}
    } as unknown as DesktopNativeOperation
    const decision = { confirmed: true, extraSpans: [{ start: 0, end: 3 }] }
    expect(parseDesktopNativeResult(operation, decision)).toEqual(decision)
    expect(() =>
      parseDesktopNativeResult(operation, {
        confirmed: true,
        extraSpans: [{ start: -1, end: 3 }]
      })
    ).toThrow()
  })
  it.each([true, false])('sends only after the doctor confirms: %s', async (confirmed) => {
    let finish!: (value: unknown) => void
    const request = vi.fn<
      (
        operation: DesktopNativeOperation,
        callerId?: string,
        signal?: AbortSignal
      ) => Promise<unknown>
    >(
      (operation) =>
        new Promise((resolve) => {
          finish = (result) => resolve(parseDesktopNativeResult(operation, result))
        })
    )
    const interaction = createRemoteDesktopFileInteraction(request)
    state.review.mockImplementation(interaction.reviewPhi!)
    const send = vi.fn<typeof fetch>(async () => new Response('{}'))
    const pending = sendRequest(send)
    const observed = pending.then(
      () => 'sent',
      () => 'blocked'
    )
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce())
    expect(send).not.toHaveBeenCalled()
    const native = request.mock.calls[0][0] as unknown as {
      operation: string
      preview: { text: string }
      labels: { confirm: string }
    }
    expect(native.operation).toBe('phi-review')
    expect(native.preview.text).not.toMatch(/架空 太郎|0098765/)
    expect(native.labels.confirm).toBe('Confirm send')
    finish({ confirmed })
    expect(await observed).toBe(confirmed ? 'sent' : 'blocked')
    expect(send).toHaveBeenCalledTimes(confirmed ? 1 : 0)
  })
  it.each(['disconnect', 'malformed', 'unavailable'])('does not send on %s', async (fault) => {
    const request = vi.fn(async () => {
      if (fault === 'disconnect') throw new Error('Desktop disconnected')
      return { confirmed: 'untrusted response' }
    })
    state.review.mockImplementation(createRemoteDesktopFileInteraction(request).reviewPhi!)
    state.available = fault !== 'unavailable'
    const send = vi.fn<typeof fetch>()
    await expect(sendRequest(send)).rejects.toThrow()
    expect(send).not.toHaveBeenCalled()
    if (fault === 'unavailable') expect(request).not.toHaveBeenCalled()
  })
  it('cancels the native review on timeout and never sends a late confirmation', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    let finish!: (value: unknown) => void
    const request = vi.fn(
      (_operation: unknown, _caller: string | undefined, cancellation?: AbortSignal) => {
        signal = cancellation
        return new Promise((resolve) => {
          finish = resolve
        })
      }
    )
    state.review.mockImplementation(createRemoteDesktopFileInteraction(request).reviewPhi!)
    const send = vi.fn<typeof fetch>()
    const assertion = expect(sendRequest(send)).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(0)
    expect(request).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(MODEL_RELEASE_TIMEOUT_MS)
    await assertion
    expect(signal?.aborted).toBe(true)
    finish({ confirmed: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(send).not.toHaveBeenCalled()
  })
})
