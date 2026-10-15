// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { initI18n } from '../../i18n'
import { MedicalResearchLaunchpad } from './MedicalResearchLaunchpad'

afterEach(() => initI18n('en'))

it('shows deliverable packages as step 2 after project setup and keeps the six research entries', async () => {
  initI18n('en')
  const host = document.createElement('div')
  const root = createRoot(host)
  const select = vi.fn()
  try {
    await act(async () => root.render(<MedicalResearchLaunchpad onSelectWorkflow={select} />))
    expect(host.querySelector('[data-testid="entry-step-1"]')?.textContent).toContain('Step 1')
    expect(host.textContent).toContain('Project setup')
    const step2 = host.querySelector('[data-testid="entry-step-2"]')
    expect(step2?.textContent).toContain('Step 2')
    expect(step2?.textContent).toContain('Choose a deliverable')
    expect(step2?.textContent).toContain('Deliverable package')
    expect(host.textContent).not.toContain('Special requirements')
    expect(host.querySelector('[data-testid="research-data-flow"]')).toBeNull()

    const packages = ['mentor-pack', 'consultation-pack', 'writing-pack'].map((id) =>
      host.querySelector<HTMLButtonElement>(`[data-testid="deliverable-package-${id}"]`)
    )
    expect(packages.every((button) => button?.disabled)).toBe(true)
    const entries = [
      'novelty',
      'evidence',
      'protocol',
      'analysis',
      'manuscript',
      'academic-english'
    ].map((id) => host.querySelector<HTMLButtonElement>(`[data-testid="research-entry-${id}"]`))
    expect(entries).toHaveLength(6)
    expect(entries.every((button) => button?.disabled)).toBe(true)

    await act(async () => host.querySelector<HTMLButtonElement>('button')!.click())
    expect(packages.every((button) => button && !button.disabled)).toBe(true)
    await act(async () => packages[0]!.click())
    await act(async () => entries[1]!.click())
    expect(select.mock.calls.map(([workflow]) => workflow)).toEqual(['mentor-pack', 'evidence'])
    const exportPackage = host.querySelector<HTMLButtonElement>(
      '[data-testid="export-statistician-package"]'
    )
    expect(exportPackage?.disabled).toBe(false)
    expect(host.querySelector('[data-testid="export-raw-data"]')).toBeNull()
    expect(host.querySelector('[data-testid="export-notebook"]')).toBeNull()
    expect(host.querySelector('[data-testid="export-chat"]')).toBeNull()
    await act(async () => exportPackage?.click())
    expect(select).toHaveBeenCalledTimes(2)
    expect(select.mock.calls[0][1].length).toBeGreaterThan(0)
  } finally {
    await act(async () => root.unmount())
  }
})
