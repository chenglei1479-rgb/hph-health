// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { i18next } from '@/i18n'
import { createInitialSettingsState, useSettingsStore } from '@/stores/settings-store'
import { ProvidersPanel } from './ProvidersPanel'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

const switchTo = async (language: string): Promise<void> => {
  await act(async () => {
    await i18next.changeLanguage(language)
  })
}

beforeEach(async () => {
  await switchTo('en')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  useSettingsStore.setState({
    ...createInitialSettingsState(),
    agentFrameworkId: 'claude-code',
    providers: []
  })
})

afterEach(async () => {
  act(() => root.unmount())
  container.remove()
  await switchTo('en')
  vi.restoreAllMocks()
})

const render = (): string => {
  act(() => {
    root.render(
      <ProvidersPanel
        onCreateProvider={vi.fn()}
        onEditProvider={vi.fn()}
        onBusyProviderChange={vi.fn()}
      />
    )
  })
  return document.body.textContent ?? ''
}

// The seed-invite block used to be a hard-coded Japanese table, so every other locale showed Japanese
// chrome in Settings > Model. These cases pin that block to the active catalog.
//
// Scope: the seed-invite section only. A provider created by redeeming an invite still carries the
// stored name written at redemption time (settings/service.ts), so a redeemed profile can still show
// シード招待枠 in the provider list — that is data, not this copy, and is out of scope here.
describe('ProvidersPanel seed-invite copy follows the UI language', () => {
  it('renders the Simplified Chinese seed-invite copy without Japanese fragments', async () => {
    await switchTo('zh-Hans')
    const text = render()

    expect(text).toContain('种子邀请名额')
    expect(text).toContain('邀请码')
    expect(text).toContain('兑换')
    expect(text).not.toContain('シード招待枠')
    expect(text).not.toContain('招待コード')
    expect(text).not.toContain('交換する')
  })

  it('keeps the Japanese beta copy in Japanese', async () => {
    await switchTo('ja')
    const text = render()

    expect(text).toContain('シード招待枠')
    expect(text).toContain('招待コード')
    expect(text).toContain('交換する')
    // The description, the byok status and the exhausted sentence all say ご自身 now; 自備 was the odd
    // one out and does not read as Japanese.
    expect(text).toContain('ご自身のキーを登録するといつでも上書きできます')
    expect(text).not.toContain('自備')
  })

  it('names the active byok status in Japanese', async () => {
    await switchTo('ja')
    useSettingsStore.setState({
      ...useSettingsStore.getState(),
      seedInvite: {
        mode: 'byok',
        redeemed: true,
        packagesUsed: 0,
        packagesRemaining: 2,
        exhausted: false
      }
    })
    const text = render()

    expect(text).toContain('ご自身のキーを使用中')
  })
})
