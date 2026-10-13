// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { initI18n } from '../../i18n'
import { MedicalResearchLaunchpad } from './MedicalResearchLaunchpad'
afterEach(() => initI18n('en'))
it('restores the six original research entries without deliverables or data-flow controls', async () => {
  initI18n('en')
  const host = document.createElement('div')
  const root = createRoot(host)
  const select = vi.fn()
  try {
    await act(async () => root.render(<MedicalResearchLaunchpad onSelectWorkflow={select} />))
    expect(host.textContent).toContain('Choose where to begin')
    expect(host.textContent).not.toContain('Choose a deliverable')
    expect(host.textContent).not.toContain('Special requirements')
    expect(host.querySelector('[data-testid="research-data-flow"]')).toBeNull()
    const buttons = Array.from(host.querySelectorAll('button')).slice(1)
    expect(buttons).toHaveLength(6)
    expect(buttons.every((button) => button.disabled)).toBe(true)
    await act(async () => host.querySelector<HTMLButtonElement>('button')!.click())
    for (const button of buttons) await act(async () => button.click())
    expect(select.mock.calls.map(([workflow]) => workflow)).toEqual([
      'novelty',
      'evidence',
      'protocol',
      'analysis',
      'manuscript',
      'academic-english'
    ])
  } finally {
    await act(async () => root.unmount())
  }
})
