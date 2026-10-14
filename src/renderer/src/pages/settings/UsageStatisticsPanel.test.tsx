// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { initI18n } from '@/i18n'
import { UsageStatisticsPanel } from './UsageStatisticsPanel'
import {
  USAGE_INSTALL_ID_STORAGE_KEY,
  USAGE_OPT_IN_STORAGE_KEY
} from './usage-statistics-preference'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('UsageStatisticsPanel', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    initI18n('en')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    localStorage.clear()
  })

  it('stays off, shows the exact payload, and can reset the install id', async () => {
    await act(async () => root.render(<UsageStatisticsPanel />))
    const toggle = container.querySelector<HTMLButtonElement>(
      '[aria-label="Send anonymous usage statistics"]'
    )
    expect(toggle?.getAttribute('aria-checked')).toBe('false')
    expect(container.textContent).toContain('Usage statistics are off.')
    expect(container.textContent).toContain('https://stats.REPLACE_ME/dra/usage')
    const preview = container.querySelector('[data-testid="usage-statistics-payload"]')?.textContent
    const payload = JSON.parse(preview ?? '{}') as { installId: string; events: unknown[] }
    expect(payload.events).toEqual([])
    expect(payload.installId).toBe(localStorage.getItem(USAGE_INSTALL_ID_STORAGE_KEY))
    expect(localStorage.getItem(USAGE_OPT_IN_STORAGE_KEY)).toBeNull()

    await act(async () => toggle?.click())
    expect(localStorage.getItem(USAGE_OPT_IN_STORAGE_KEY)).toBe('on')
    expect(container.textContent).toContain(
      'Sending is disabled while the endpoint is a placeholder.'
    )

    const reset = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Reset install id'
    )
    await act(async () => reset?.click())
    const next = JSON.parse(
      container.querySelector('[data-testid="usage-statistics-payload"]')?.textContent ?? '{}'
    ) as { installId: string }
    expect(next.installId).not.toBe(payload.installId)
    expect(next.installId).toBe(localStorage.getItem(USAGE_INSTALL_ID_STORAGE_KEY))
  })
})
