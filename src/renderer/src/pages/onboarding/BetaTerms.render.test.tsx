// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSettingsStore } from '@/stores/settings-store'
import { BETA_TERMS_VERSION } from '../../../../shared/beta-terms'
import { BetaTermsConsent, BetaTermsContent } from './BetaTerms'
import { BetaTermsGate } from './BetaTermsGate'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  const acceptBetaTerms = vi.fn().mockResolvedValue(undefined)
  useSettingsStore.setState({ acceptBetaTerms })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ''
})

const render = async (node: React.JSX.Element): Promise<void> => {
  await act(async () => {
    root.render(node)
  })
}

const checkbox = (): HTMLInputElement =>
  container.querySelector<HTMLInputElement>('input[type="checkbox"]')!

describe('BetaTermsConsent', () => {
  it('starts unchecked and keeps the agreement action disabled with an aria explanation', async () => {
    await render(<BetaTermsConsent onAccepted={vi.fn()} />)

    expect(checkbox().checked).toBe(false)
    const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
      /agree and continue/i.test(candidate.textContent ?? '')
    )
    expect(button?.disabled).toBe(true)
    expect(button?.getAttribute('aria-describedby')).toBeTruthy()
    expect(container.textContent).toContain('Select the checkbox above to continue.')
  })

  it('saves the acceptance only after the user checks the box', async () => {
    const onAccepted = vi.fn()
    await render(<BetaTermsConsent onAccepted={onAccepted} />)

    await act(async () => {
      checkbox().click()
    })
    const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
      /agree and continue/i.test(candidate.textContent ?? '')
    )
    expect(button?.disabled).toBe(false)
    await act(async () => {
      button?.click()
      await Promise.resolve()
    })

    expect(useSettingsStore.getState().acceptBetaTerms).toHaveBeenCalledOnce()
    expect(onAccepted).toHaveBeenCalledOnce()
  })

  it('keeps the gate closed and shows the error when the local write fails', async () => {
    const onAccepted = vi.fn()
    useSettingsStore.setState({
      acceptBetaTerms: vi.fn().mockRejectedValue(new Error('disk full'))
    })
    await render(<BetaTermsConsent onAccepted={onAccepted} />)
    await act(async () => {
      checkbox().click()
    })
    const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
      /agree and continue/i.test(candidate.textContent ?? '')
    )
    await act(async () => {
      button?.click()
      await Promise.resolve()
    })

    expect(onAccepted).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('disk full')
  })

  it('shows every required beta condition', async () => {
    await render(
      <>
        <BetaTermsContent />
        <BetaTermsConsent onAccepted={vi.fn()} />
      </>
    )

    expect(container.textContent).toContain('unsigned internal test build')
    expect(container.textContent).toContain('personal computer')
    // The beta admits fictional data only; de-identified real data needs a written pilot agreement.
    expect(container.textContent).toContain('Fictitious data only during the beta')
    expect(container.textContent).toContain('use only fictional data')
    expect(container.textContent).toContain('institution-approved pilot')
    expect(container.textContent).toContain(
      'Your input is sent to the destination shown for the active key mode: the AI contracted by the operator for a seed invite, or the provider you registered for BYOK. Your API key is stored on this computer.'
    )
    expect(container.textContent).toContain('defects and changes')
  })
})

describe('BetaTermsGate', () => {
  it('renders as a standalone full-page gate and never pre-checks consent', async () => {
    await render(<BetaTermsGate onAccepted={vi.fn()} />)

    expect(container.querySelector('main')).not.toBeNull()
    expect(checkbox().checked).toBe(false)
    expect(container.textContent).toContain('Beta terms of use')
    expect(container.textContent).toContain('Baselio')
  })

  // A version bump re-opens the gate for everyone. Only users who acknowledged an older version are
  // told that the terms changed; a fresh install must not claim an update it never had.
  it('tells a returning user that the terms changed', async () => {
    await render(<BetaTermsGate onAccepted={vi.fn()} previousVersion="2026-10-β1" />)

    expect(container.querySelector('[data-testid="beta-terms-updated-notice"]')?.textContent).toBe(
      'The beta terms have been updated. Review them and agree again to continue.'
    )
  })

  it('does not claim an update on a fresh install', async () => {
    await render(<BetaTermsGate onAccepted={vi.fn()} />)

    expect(container.querySelector('[data-testid="beta-terms-updated-notice"]')).toBeNull()
    expect(container.textContent).not.toContain('have been updated')
  })

  it('does not claim an update when the stored acceptance already matches', async () => {
    await render(<BetaTermsGate onAccepted={vi.fn()} previousVersion={BETA_TERMS_VERSION} />)

    expect(container.querySelector('[data-testid="beta-terms-updated-notice"]')).toBeNull()
  })
})

// The printable copy and the saved text are the same document the user acknowledged, so they must
// carry the current wording and version rather than a stale snapshot.
describe('printable beta terms', () => {
  it('saves the current terms with the current version', async () => {
    const saveBlobFile = vi.fn().mockResolvedValue(undefined)
    ;(window as unknown as { api: Record<string, unknown> }).api = { saveBlobFile }
    await render(<BetaTermsConsent onAccepted={vi.fn()} />)

    const open = Array.from(container.querySelectorAll('button')).find((candidate) =>
      /open the printable full version/i.test(candidate.textContent ?? '')
    )
    await act(async () => {
      open?.click()
      await Promise.resolve()
    })
    const save = Array.from(document.querySelectorAll('button')).find((candidate) =>
      /save a copy/i.test(candidate.textContent ?? '')
    )
    await act(async () => {
      save?.click()
      await Promise.resolve()
    })

    expect(saveBlobFile).toHaveBeenCalledOnce()
    const request = saveBlobFile.mock.calls[0][0] as {
      suggestedName: string
      data: ArrayBuffer
    }
    expect(request.suggestedName).toBe(`Baselio-beta-terms-${BETA_TERMS_VERSION}.txt`)
    const text = new TextDecoder().decode(new Uint8Array(request.data))
    expect(text).toContain(`β ${BETA_TERMS_VERSION}`)
    expect(text).toContain('Fictitious data only during the beta')
    expect(text).toContain('institution-approved pilot')
    expect(text).not.toContain('Fictitious or de-identified data only')
  })
})
