// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { AccountState } from '../../../shared/account'
import { AccountButton, AccountGate } from './AccountGate'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string, options: Record<string, string> = {}) =>
      key.replace(/\{\{(.+?)\}\}/g, (match, name) => options[name] ?? match)
  })
}))
let root: Root
let host: HTMLDivElement
afterEach(async () => {
  if (root) await act(async () => root.unmount())
  host?.remove()
  vi.useRealTimers()
  vi.unstubAllEnvs()
})
const render = async (account?: NonNullable<typeof window.api.account>): Promise<void> => {
  Object.defineProperty(window, 'api', { configurable: true, value: { account } })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () =>
    root.render(
      <AccountGate>
        <div data-testid="private-workspace" />
        <AccountButton />
      </AccountGate>
    )
  )
}
const state = (overrides: Partial<AccountState> = {}): AccountState => ({
  configured: true,
  required: true,
  pending: false,
  methods: ['email', 'google', 'microsoft', 'apple'],
  ...overrides
})
const button = (copy: string): HTMLButtonElement =>
  Array.from(document.querySelectorAll('button')).find((item) => item.textContent === copy)!
it('offers institution SSO only when configured and includes the current profile', async () => {
  const login = vi.fn(async () => state({ pending: true }))
  await render({
    getState: vi.fn(async () => state({ profile: 'doctor-a', methods: ['email', 'institution'] })),
    login,
    logout: vi.fn()
  })
  expect(host.textContent).toContain('Local profile: doctor-a')
  await act(async () => button('Continue with institution SSO').click())
  expect(login).toHaveBeenCalledWith({ method: 'institution', signup: false })
})

it('does not mount the research workspace before login and distinguishes registration from login', async () => {
  const login = vi.fn(async () => state({ pending: true }))
  await render({ getState: vi.fn(async () => state()), login, logout: vi.fn() })
  expect(host.querySelector('[data-testid="private-workspace"]')).toBeNull()
  expect(button('Continue with Google')).toBeDefined()
  await act(async () => button('Create a DRA account').click())
  expect(login).toHaveBeenCalledWith({ method: 'email', signup: true })
  expect(host.textContent).toContain('Complete registration or login in your browser')
  expect(host.querySelector('[data-testid="private-workspace"]')).toBeNull()
})
it('unmounts the workspace when the main-process session expires', async () => {
  vi.useFakeTimers()
  let current = state({ user: { subject: 'owner-1', email: 'owner@example.org' } })
  await render({ getState: vi.fn(async () => current), login: vi.fn(), logout: vi.fn() })
  expect(host.querySelector('[data-testid="private-workspace"]')).not.toBeNull()
  current = state()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2100)
  })
  expect(host.querySelector('[data-testid="private-workspace"]')).toBeNull()
})
it('skips the login gate and does not request account state on a prerelease build', async () => {
  vi.stubEnv('DRA_PRERELEASE', '1')
  const getState = vi.fn()
  await render({ getState, login: vi.fn(), logout: vi.fn() })
  expect(getState).not.toHaveBeenCalled()
  expect(host.querySelector('[data-testid="private-workspace"]')).not.toBeNull()
  expect(host.textContent).not.toContain('Continue with email')
  expect(host.textContent).not.toContain('Your DRA account')
  vi.unstubAllEnvs()
})
it('allows paired-browser mode without a native API and keeps local mode usable before service setup', async () => {
  await render()
  expect(host.querySelector('[data-testid="private-workspace"]')).not.toBeNull()
  await act(async () => root.unmount())
  host.remove()
  await render({
    getState: vi.fn(async () => state({ configured: false, required: false, methods: [] })),
    login: vi.fn(),
    logout: vi.fn()
  })
  expect(host.querySelector('[data-testid="private-workspace"]')).not.toBeNull()
  await act(async () => button('Account').click())
  expect(button('Continue with email').disabled).toBe(true)
})
it('signs out from the account dialog and removes private content', async () => {
  const logout = vi.fn(async () => state())
  await render({
    getState: vi.fn(async () =>
      state({ user: { subject: 'owner-1', email: 'owner@example.org' } })
    ),
    login: vi.fn(),
    logout
  })
  await act(async () => button('Account').click())
  expect(document.body.textContent).toContain('owner@example.org')
  await act(async () => button('Sign out of DRA').click())
  expect(logout).toHaveBeenCalledOnce()
  expect(host.querySelector('[data-testid="private-workspace"]')).toBeNull()
})
it('opens membership from the account dialog and preserves the research workspace', async () => {
  await render({
    getState: vi.fn(async () =>
      state({
        user: { subject: 'owner-1', email: 'owner@example.org' },
        membership: { plan: 'plus', status: 'active', validUntil: Date.now() + 86400000 }
      })
    ),
    login: vi.fn(),
    logout: vi.fn()
  })
  expect(document.querySelector('[data-testid="membership-panel"]')).toBeNull()
  await act(async () => button('Account').click())
  await act(async () => button('Membership and plans').click())
  expect(document.querySelector('[data-testid="membership-panel"]')?.textContent).toContain('$20')
  expect(host.querySelector('[data-testid="private-workspace"]')).not.toBeNull()
})
it('has translations for every account interface string in all eight locales', () => {
  const component = readFileSync(resolve('src/renderer/src/components/AccountGate.tsx'), 'utf8')
  const keys = [...component.matchAll(/\bt\('([^']+)'\)/g)].map((match) => match[1])
  for (const locale of ['zh-Hans', 'zh-Hant', 'ja', 'ko', 'fr', 'ru', 'de', 'es']) {
    const catalog = JSON.parse(
      readFileSync(resolve(`src/shared/i18n/locales/${locale}.json`), 'utf8')
    )
    for (const key of keys) expect(catalog.renderer[key], `${locale}: ${key}`).toBeTruthy()
  }
})
