import { afterEach, describe, expect, it, vi } from 'vitest'

import { englishNativeTranslator } from '../locale/main-process-messages'
import { createRemoteDesktopFileInteraction } from '../desktop-interaction'
import type { DesktopNativeOperation } from '../desktop-native-contract'
import type { PhiConfirmDecision, PhiConfirmLabels, PhiPreview } from '../phi/confirm'
import {
  createStatisticianExportConfirmer,
  StatisticianConfirmUnavailableError
} from './confirm-window'

type ReviewPhi = (
  preview: PhiPreview,
  labels: PhiConfirmLabels,
  callerId?: string,
  signal?: AbortSignal
) => Promise<PhiConfirmDecision>

const state = vi.hoisted(() => ({
  review: undefined as ReviewPhi | undefined,
  unavailable: false
}))

// Partial mock: only the privacy-review bridge owner is replaced, so the real remote bridge
// (createRemoteDesktopFileInteraction) stays available for the phi-review regression below.
vi.mock('../desktop-interaction', async (original) => ({
  ...(await original<typeof import('../desktop-interaction')>()),
  desktopFileInteraction: () => {
    if (state.unavailable) throw new Error('Desktop file interaction is unavailable.')
    return { reviewPhi: state.review }
  }
}))

const preview: PhiPreview = {
  text: 'Mean difference 1.4. 研究期間：2020-01-01 to 2024-12-31.',
  highlights: [{ start: 0, end: 4, category: 'name' }]
}

const expectedLabels: PhiConfirmLabels = {
  title: 'Review de-identified export',
  explanation:
    'Highlighted patient information was removed from the statistician package. Confirm to export these files. Closing this window exports nothing.',
  confirm: 'Confirm export',
  cancel: 'Cancel',
  mark: 'Mark selection'
}

const confirmer = (): ReturnType<typeof createStatisticianExportConfirmer> =>
  createStatisticianExportConfirmer(englishNativeTranslator)

afterEach(() => {
  state.review = undefined
  state.unavailable = false
})

describe('statistician export confirmation', () => {
  it('asks the cross-process privacy review and forwards the cancellation signal', async () => {
    const review = vi.fn<ReviewPhi>(async () => ({ confirmed: true }))
    state.review = review
    const controller = new AbortController()

    await expect(confirmer()(preview, controller.signal)).resolves.toEqual({ confirmed: true })

    expect(review).toHaveBeenCalledOnce()
    const [sentPreview, labels, callerId, signal] = review.mock.calls[0]
    expect(sentPreview).toEqual(preview)
    expect(labels).toEqual(expectedLabels)
    expect(callerId).toBeUndefined()
    expect(signal).toBe(controller.signal)
  })

  it('returns manual masking marks from the native review', async () => {
    const extraSpans = [{ start: 0, end: 4 }]
    state.review = vi.fn<ReviewPhi>(async () => ({ confirmed: true, extraSpans }))

    await expect(confirmer()(preview)).resolves.toEqual({ confirmed: true, extraSpans })
  })

  it('reports a cancellation as an unconfirmed decision', async () => {
    state.review = vi.fn<ReviewPhi>(async () => ({ confirmed: false }))

    await expect(confirmer()(preview)).resolves.toEqual({ confirmed: false })
  })

  it('fails loudly when the privacy review bridge is missing', async () => {
    state.review = undefined

    await expect(confirmer()(preview)).rejects.toBeInstanceOf(StatisticianConfirmUnavailableError)
    await expect(confirmer()(preview)).rejects.toThrow(/requires the desktop privacy review bridge/)
  })

  it('propagates a review failure instead of reporting a cancellation', async () => {
    state.review = vi.fn<ReviewPhi>(async () => {
      throw new Error('Desktop disconnected')
    })

    await expect(confirmer()(preview)).rejects.toThrow('Desktop disconnected')
  })

  it('propagates an unavailable desktop interaction', async () => {
    state.unavailable = true

    await expect(confirmer()(preview)).rejects.toThrow('Desktop file interaction is unavailable.')
  })

  it('reaches the native review as a phi-review request, not a local window', async () => {
    const request = vi.fn<
      (
        operation: DesktopNativeOperation,
        callerId?: string,
        signal?: AbortSignal
      ) => Promise<unknown>
    >(async () => ({ confirmed: true }))
    state.review = createRemoteDesktopFileInteraction(request).reviewPhi!

    const controller = new AbortController()
    await expect(confirmer()(preview, controller.signal)).resolves.toEqual({ confirmed: true })

    expect(request).toHaveBeenCalledOnce()
    const [operation, callerId, signal] = request.mock.calls[0]
    expect(operation).toEqual({ operation: 'phi-review', preview, labels: expectedLabels })
    expect(callerId).toBeUndefined()
    expect(signal).toBe(controller.signal)
  })
})
