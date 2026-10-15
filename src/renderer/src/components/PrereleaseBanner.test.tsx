// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'

import { useLocaleStore } from '@/stores/locale-store'

import { PRERELEASE_BANNER_TEXT, prereleaseBannerText } from '../../../shared/prerelease'
import { PrereleaseBanner } from './PrereleaseBanner'

let root: Root | undefined
let host: HTMLDivElement | undefined

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  host?.remove()
  root = undefined
  host = undefined
  vi.unstubAllEnvs()
})

const render = async (): Promise<void> => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root?.render(<PrereleaseBanner />))
}

it('shows the Japanese internal-test warning on a prerelease build', async () => {
  vi.stubEnv('DRA_PRERELEASE', '1')
  useLocaleStore.setState({ preference: 'ja', locale: 'ja' })
  await render()
  const banner = host?.querySelector('[data-testid="prerelease-banner"]')
  expect(banner?.textContent).toBe(PRERELEASE_BANNER_TEXT)
  expect(banner?.getAttribute('role')).toBe('status')
})

it('follows the UI language and keeps the fictional-data warning', async () => {
  vi.stubEnv('DRA_PRERELEASE', '1')
  useLocaleStore.setState({ preference: 'zh-Hans', locale: 'zh-Hans' })
  await render()
  const banner = (): Element | null | undefined =>
    host?.querySelector('[data-testid="prerelease-banner"]')
  expect(banner()?.textContent).toBe('内部测试版：请仅使用虚构数据')
  expect(banner()?.textContent).toContain('虚构数据')
  await act(async () => {
    useLocaleStore.setState({ preference: 'en', locale: 'en' })
  })
  expect(banner()?.textContent).toBe('Internal test build: use fictional data only')
  await act(async () => {
    useLocaleStore.setState({ preference: 'ja', locale: 'ja' })
  })
  expect(banner()?.textContent).toBe(PRERELEASE_BANNER_TEXT)
  expect(prereleaseBannerText('zh-CN')).toBe('内部测试版：请仅使用虚构数据')
  expect(prereleaseBannerText('pt-BR')).toBe('Internal test build: use fictional data only')
  expect(prereleaseBannerText('pt-BR')).not.toBe(PRERELEASE_BANNER_TEXT)
})

it('stays hidden on a stable build', async () => {
  await render()
  expect(host?.querySelector('[data-testid="prerelease-banner"]')).toBeNull()
})
