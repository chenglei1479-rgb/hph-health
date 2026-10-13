// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createInitialSettingsState, useSettingsStore } from '@/stores/settings-store'
import { initI18n } from '../i18n'
import { ResearchDataFlowNotice } from './ResearchDataFlowNotice'
beforeEach(() =>
  useSettingsStore.setState({
    ...createInitialSettingsState(),
    activeProviderId: 'a',
    activeModel: 'default-model',
    providers: [
      {
        id: 'a',
        name: 'Default recipient',
        type: 'custom',
        hasKey: true,
        needsKey: true,
        supportsImageInput: false,
        models: ['default-model'],
        baseUrl: 'https://user:secret@a.test/path?token=hidden'
      },
      {
        id: 'b',
        name: 'Session recipient',
        type: 'custom',
        hasKey: true,
        needsKey: true,
        supportsImageInput: false,
        models: ['session-model'],
        baseUrl: 'http://localhost:8000'
      }
    ]
  })
)
afterEach(() => initI18n('en'))
it('uses the session selection, reacts to auxiliary routing changes, and exposes only safe addresses', async () => {
  const host = document.createElement('div')
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(<ResearchDataFlowNotice sessionContext providerId="b" model="session-model" />)
    )
    expect(host.querySelector('tbody tr')!.textContent).toContain('Session recipient')
    expect(host.querySelector('tbody tr')!.textContent).not.toContain('Default recipient')
    expect(host.textContent).toContain('may still forward data')
    await act(async () =>
      useSettingsStore.setState({
        reviewerModel: {
          mode: 'fixed',
          providerId: 'a',
          model: 'review-model',
          reasoningEffort: 'low'
        }
      })
    )
    expect(host.querySelectorAll('tbody tr')[3].textContent).toContain('Default recipient')
    expect(host.querySelectorAll('tbody tr')[3].textContent).toContain('review-model')
    for (const secret of ['secret', '?token', '/path'])
      expect(host.textContent).not.toContain(secret)
  } finally {
    await act(async () => root.unmount())
  }
})
it('does not substitute global defaults for an unavailable session route', async () => {
  const host = document.createElement('div')
  const root = createRoot(host)
  try {
    await act(async () => root.render(<ResearchDataFlowNotice sessionContext />))
    expect(host.querySelector('tbody tr')!.textContent).toContain('Recipient unknown')
    expect(host.querySelector('tbody tr')!.textContent).not.toContain('Default recipient')
  } finally {
    await act(async () => root.unmount())
  }
})
it('localizes Japanese destinations and opens settings without changing routing', async () => {
  initI18n('ja')
  const open = vi.fn()
  useSettingsStore.setState({ openSettingsToPanel: open })
  const host = document.createElement('div')
  const root = createRoot(host)
  try {
    await act(async () => root.render(<ResearchDataFlowNotice />))
    expect(host.textContent).toContain('ローカル優先はオフラインを意味しません')
    expect(host.textContent).toContain('最初のユーザーメッセージ')
    await act(async () => host.querySelector<HTMLButtonElement>('button')!.click())
    expect(open).toHaveBeenCalledWith('model')
    expect(useSettingsStore.getState().activeProviderId).toBe('a')
  } finally {
    await act(async () => root.unmount())
  }
})
