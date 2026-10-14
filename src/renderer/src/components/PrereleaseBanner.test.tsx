// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'

import { PRERELEASE_BANNER_TEXT } from '../../../shared/prerelease'
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
  await render()
  const banner = host?.querySelector('[data-testid="prerelease-banner"]')
  expect(banner?.textContent).toBe(PRERELEASE_BANNER_TEXT)
  expect(banner?.getAttribute('role')).toBe('status')
})

it('stays hidden on a stable build', async () => {
  await render()
  expect(host?.querySelector('[data-testid="prerelease-banner"]')).toBeNull()
})
