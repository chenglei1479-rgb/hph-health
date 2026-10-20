// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProviderView } from '../../../shared/settings'
import { useSettingsStore } from '@/stores/settings-store'
import { NoProviderNotice } from './NoProviderNotice'

let container: HTMLDivElement
let root: Root

const provider = (): ProviderView => ({
  id: 'p1',
  name: 'Gateway',
  type: 'custom',
  model: 'model',
  models: ['model'],
  apiEndpoints: ['openai'],
  supportsImageInput: false,
  hasKey: true,
  needsKey: false
})

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ''
})

const render = async (): Promise<void> => {
  await act(async () => {
    root.render(<NoProviderNotice />)
  })
}

describe('NoProviderNotice', () => {
  it('shows the unified unconfigured-service card and opens Settings > Model', async () => {
    const openSettingsToPanel = vi.fn()
    useSettingsStore.setState({
      providers: [],
      activeProviderId: undefined,
      agentFrameworkId: 'codex',
      agentFrameworks: [
        {
          id: 'codex',
          displayName: 'Codex',
          supportsSkills: true,
          supportedApiTypes: ['responses']
        }
      ],
      openSettingsToPanel
    })
    await render()

    expect(container.textContent).toContain(
      'AI service is not configured. Register an API key in Settings > Model.'
    )
    const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
      /open settings > model/i.test(candidate.textContent ?? '')
    )
    await act(async () => {
      button?.click()
    })
    expect(openSettingsToPanel).toHaveBeenCalledWith('model')
  })

  it('disappears once a usable provider is configured', async () => {
    useSettingsStore.setState({
      providers: [provider()],
      activeProviderId: 'p1',
      agentFrameworkId: 'codex',
      agentFrameworks: [
        {
          id: 'codex',
          displayName: 'Codex',
          supportsSkills: true,
          supportedApiTypes: ['openai']
        }
      ]
    })
    await render()

    expect(container.textContent).toBe('')
  })
})
