// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useThemeStore } from '@/stores/theme-store'
import { useUpdateStore } from '@/stores/update-store'
import { AppVersionSection } from './AppVersionSection'

vi.mock('@/assets/logo.png', () => ({ default: 'logo.png' }))
vi.mock('@/assets/logo-dark.png', () => ({ default: 'logo-dark.png' }))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  useThemeStore.getState().setPreference('light')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  useUpdateStore.setState({
    appInfo: {
      name: 'DRA',
      version: '0.2.0',
      copyright: '© 2026 AIPOCH. All rights reserved.'
    },
    status: { state: 'up-to-date', current: '0.2.0', latest: '0.2.0' }
  })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('AppVersionSection', () => {
  it('explains the disabled update service and disables checking', () => {
    useUpdateStore.setState({ status: { state: 'disabled', current: '0.1.29' } })
    act(() => root.render(<AppVersionSection />))
    expect(container.textContent).toContain(
      'Automatic updates are disabled until a DRA update service is configured.'
    )
    const checkButton = Array.from(container.querySelectorAll('button')).find((element) =>
      /check now/i.test(element.textContent ?? '')
    )
    expect(checkButton?.disabled).toBe(true)
    expect(container.textContent).not.toContain('You are on the latest version')
  })

  it('shows a fixed Japanese notice and no update actions in a prerelease build', () => {
    vi.stubEnv('DRA_PRERELEASE', '1')
    useUpdateStore.setState({
      status: { state: 'available', current: '0.1.33-beta.1', latest: '0.2.0', notes: 'n' }
    })
    act(() => root.render(<AppVersionSection />))
    expect(container.textContent).toContain(
      'テスト版では自動更新は無効です。新しい版は配布元からお知らせします。'
    )
    expect(container.textContent).not.toContain('Check now')
    expect(container.textContent).not.toContain('Update to 0.2.0')
    expect(container.textContent).not.toContain(
      'Automatic updates are disabled until a DRA update service is configured.'
    )
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })
  it('opens the project license from a resource row without an inline disclosure', () => {
    act(() => root.render(<AppVersionSection />))
    const link = container.querySelector('a[aria-label="Open-source license"]')
    expect(link?.getAttribute('href')).toBe(
      'https://github.com/chenglei1479-rgb/hph-health/blob/main/LICENSE'
    )
    expect(link?.textContent).toContain('Apache-2.0')
    expect(container.querySelector('details, pre')).toBeNull()
  })

  it('shows the app name, version, and copyright', () => {
    act(() => {
      root.render(<AppVersionSection />)
    })

    expect(container.textContent).toContain('DRA')
    expect(container.textContent).toContain('v0.2.0')
    expect(container.textContent).toContain('© 2026 DRA')
    expect(container.textContent).toContain('Based on AIPOCH Open-Science')
    expect(container.textContent).toContain('AIPOCH Open-Science をベースに開発')
    expect(container.querySelector('img[alt*="AIPOCH"]')).toBeNull()
  })

  it('shows LICENSE, NOTICE, and third-party notices without an AIPOCH logo', () => {
    act(() => root.render(<AppVersionSection />))
    const open = Array.from(container.querySelectorAll('button')).find(
      (element) => element.getAttribute('aria-label') === 'Licenses'
    )
    expect(open).toBeDefined()
    act(() => open?.click())
    const dialog = document.body.textContent ?? ''
    expect(dialog).toContain('Project license (LICENSE)')
    expect(dialog).toContain('Notices (NOTICE)')
    expect(dialog).toContain('Third-party notices')
    expect(dialog).toContain('Apache License')
    expect(dialog).toContain('modified from AIPOCH Open-Science v0.36.0')
    expect(dialog).toContain('THIRD-PARTY NOTICES')
    expect(dialog).toContain('AIPOCH Open-Science をベースに開発')
    expect(document.body.querySelector('img[alt*="AIPOCH"], img[src*="aipoch"]')).toBeNull()
  })

  it('links help and release history to the canonical external resources', () => {
    act(() => {
      root.render(<AppVersionSection />)
    })

    const links = Array.from(container.querySelectorAll('a'))
    expect(links).toHaveLength(3)
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://github.com/chenglei1479-rgb/hph-health#readme',
      'https://github.com/chenglei1479-rgb/hph-health/releases',
      'https://github.com/chenglei1479-rgb/hph-health/blob/main/LICENSE'
    ])
    expect(links.every((link) => link.target === '_blank' && link.rel === 'noreferrer')).toBe(true)
  })

  it('reveals resource details and primary-colored icons on pointer hover or keyboard focus', () => {
    act(() => {
      root.render(<AppVersionSection />)
    })

    const links = Array.from(container.querySelectorAll('a'))
    const icons = Array.from(container.querySelectorAll('[data-slot="about-resource-icon"]'))
    const titles = Array.from(container.querySelectorAll('[data-slot="about-resource-title"]'))
    const descriptions = Array.from(
      container.querySelectorAll('[data-slot="about-resource-description"]')
    )

    expect(links).toHaveLength(3)
    expect(links.every((link) => link.classList.contains('group'))).toBe(true)
    expect(icons).toHaveLength(3)
    expect(
      icons.every(
        (icon) =>
          icon.classList.contains('group-hover:text-primary') &&
          icon.classList.contains('group-focus-visible:text-primary')
      )
    ).toBe(true)
    expect(titles).toHaveLength(3)
    expect(titles.every((title) => !title.classList.contains('translate-y-2.5'))).toBe(true)
    expect(
      titles.every(
        (title) =>
          title.classList.contains('[@media(hover:hover)_and_(pointer:fine)]:translate-y-2.5') &&
          title.classList.contains(
            '[@media(hover:hover)_and_(pointer:fine)]:group-hover:translate-y-0'
          ) &&
          title.classList.contains(
            '[@media(hover:hover)_and_(pointer:fine)]:group-focus-visible:translate-y-0'
          ) &&
          title.classList.contains('[@media(any-pointer:coarse)]:!translate-y-0')
      )
    ).toBe(true)
    expect(descriptions).toHaveLength(3)
    expect(descriptions.every((description) => !description.classList.contains('opacity-0'))).toBe(
      true
    )
    expect(
      descriptions.every(
        (description) =>
          description.classList.contains('[@media(hover:hover)_and_(pointer:fine)]:opacity-0') &&
          description.classList.contains(
            '[@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100'
          ) &&
          description.classList.contains(
            '[@media(hover:hover)_and_(pointer:fine)]:group-focus-visible:opacity-100'
          ) &&
          description.classList.contains('[@media(any-pointer:coarse)]:!opacity-100')
      )
    ).toBe(true)
  })

  it('switches the About logo with an explicit app Theme', () => {
    act(() => {
      root.render(<AppVersionSection />)
    })

    const sources = (): string[] =>
      Array.from(container.querySelectorAll('img')).map((img) => img.getAttribute('src') ?? '')
    expect(sources()).toEqual(['logo.png', 'logo-dark.png'])
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    act(() => useThemeStore.getState().setPreference('dark'))

    expect(sources()).toEqual(['logo.png', 'logo-dark.png'])
    expect(container.querySelector('img[src="logo-dark.png"]')?.className).toContain('dark:block')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('switches the About logo when System follows an OS appearance change', () => {
    let systemListener: ((event: { matches: boolean }) => void) | undefined
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        media: '(prefers-color-scheme: dark)',
        addEventListener: (_event: string, listener: (event: { matches: boolean }) => void) => {
          systemListener = listener
        },
        removeEventListener: vi.fn()
      }))
    )

    act(() => {
      useThemeStore.getState().setPreference('system')
      root.render(<AppVersionSection />)
    })
    expect(
      Array.from(container.querySelectorAll('img')).map((img) => img.getAttribute('src'))
    ).toEqual(['logo.png', 'logo-dark.png'])
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    act(() => systemListener?.({ matches: true }))

    expect(useThemeStore.getState().preference).toBe('system')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(container.querySelector('img[src="logo-dark.png"]')?.className).toContain('dark:block')
  })

  it('keeps the full update error available and routes retry to the existing owner', () => {
    const check = vi.fn(async () => {})
    useUpdateStore.setState({
      status: { state: 'error', current: '0.2.0', error: 'net::ERR_NAME_NOT_RESOLVED' },
      check
    })
    act(() => root.render(<AppVersionSection />))
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'net::ERR_NAME_NOT_RESOLVED'
    )
    const button = Array.from(container.querySelectorAll('button')).find((element) =>
      /check now/i.test(element.textContent ?? '')
    )!
    act(() => button.click())
    expect(check).toHaveBeenCalledOnce()
  })

  it('shows an update action when a new version is available', () => {
    useUpdateStore.setState({
      status: { state: 'available', current: '0.2.0', latest: '0.3.0', notes: 'n' }
    })

    act(() => {
      root.render(<AppVersionSection />)
    })

    const button = Array.from(container.querySelectorAll('button')).find((element) =>
      /update to 0\.3\.0/i.test(element.textContent ?? '')
    )

    expect(button).toBeDefined()
  })

  it.each([
    ['restart', 'Restart to update'],
    ['installer', 'Update downloaded — open the installer to finish']
  ] as const)('shows the ready instruction for the %s apply strategy', (applyKind, message) => {
    useUpdateStore.setState({
      status: { state: 'ready', current: '0.2.0', latest: '0.3.0', applyKind }
    })

    act(() => {
      root.render(<AppVersionSection />)
    })

    expect(container.textContent).toContain(message)
  })

  it.each([
    ['downloading', true],
    ['ready', false]
  ] as const)('sets check availability while the update is %s', (state, disabled) => {
    useUpdateStore.setState({
      status: { state, current: '0.2.0', latest: '0.3.0' }
    })

    act(() => {
      root.render(<AppVersionSection />)
    })

    const checkButton = Array.from(container.querySelectorAll('button')).find((element) =>
      /check now/i.test(element.textContent ?? '')
    )
    expect(checkButton?.disabled).toBe(disabled)
  })
})

it('shows a rejected update action while preserving the ready installer action', () => {
  useUpdateStore.setState({
    status: { state: 'ready', current: '0.2.0', latest: '0.3.0', error: 'IPC unavailable' }
  })
  act(() => root.render(<AppVersionSection />))
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('IPC unavailable')
  expect(useUpdateStore.getState().status.state).toBe('ready')
})
