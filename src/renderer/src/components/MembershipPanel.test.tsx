// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { MembershipPanel } from './MembershipPanel'
import { ErrorNotice } from './error-notice'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { NotebookAccessCheck } from '../../../shared/account'
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string, options?: Record<string, string>) =>
      key.replace(/\{\{(\w+)\}\}/g, (_, name) => options?.[name] ?? name)
  })
}))
it('uses host evidence for permission checks and clears old results after downgrade or failure', async () => {
  const host = document.createElement('div'),
    root = createRoot(host)
  const check: NotebookAccessCheck = {
    checkedAt: Date.now(),
    state: {
      configured: true,
      required: true,
      pending: false,
      methods: ['google'],
      user: { subject: 'test' },
      membership: { plan: 'pro', status: 'active', validUntil: Date.now() + 60000 }
    },
    foreground: { allowed: true },
    background: { allowed: true }
  }
  const onCheck = vi.fn(async () => check)
  const clickCheck = async (): Promise<void> => {
    await act(async () => (host.querySelector('button') as HTMLButtonElement).click())
  }
  try {
    await act(async () =>
      root.render(
        <MembershipPanel membership={check.state.membership} onCheckNotebookAccess={onCheck} />
      )
    )
    expect(host.textContent).not.toContain('Notebook permissions: allowed')
    await clickCheck()
    expect(onCheck).toHaveBeenCalledOnce()
    expect(host.textContent).toContain('Background permissions: allowed')
    await act(async () =>
      root.render(
        <MembershipPanel
          membership={{ plan: 'free', status: 'free' }}
          onCheckNotebookAccess={onCheck}
        />
      )
    )
    expect(host.textContent).not.toContain('Notebook permissions: allowed')
    onCheck.mockResolvedValueOnce({
      ...check,
      state: { ...check.state, membership: { plan: 'free', status: 'free' } },
      foreground: { allowed: false, error: 'DRA_MEMBERSHIP_REQUIRED:plus:notebook-execution' },
      background: { allowed: false, error: 'DRA_MEMBERSHIP_REQUIRED:pro:background-execution' }
    })
    await clickCheck()
    expect(host.textContent).toContain('Notebook permissions: Plus required')
    expect(host.textContent).toContain('DRA_MEMBERSHIP_REQUIRED:plus:notebook-execution')
    onCheck.mockRejectedValueOnce(new Error('offline'))
    await clickCheck()
    expect(host.textContent).toContain('Permission check failed. Please retry.')
    expect(host.textContent).not.toContain('Notebook permissions: Plus required')
  } finally {
    await act(async () => root.unmount())
  }
})
it('shows actionable upgrade guidance and translates membership copy in every locale', async () => {
  const host = document.createElement('div'),
    root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <ErrorNotice
          title="Execution failed"
          description="Error: DRA_MEMBERSHIP_REQUIRED:pro:multi-agent"
        />
      )
    )
    expect(host.textContent).toContain('Pro membership is required')
    expect(host.textContent).not.toContain('DRA_MEMBERSHIP_REQUIRED')
  } finally {
    await act(async () => root.unmount())
  }
  const source = ['MembershipPanel.tsx', 'error-notice.tsx']
    .map((file) => readFileSync(resolve('src/renderer/src/components', file), 'utf8'))
    .join('\n')
  const keys = [...source.matchAll(/\bt\(\s*'([^']+)'/g)].map((match) => match[1])
  for (const locale of ['zh-Hans', 'zh-Hant', 'ja', 'ko', 'fr', 'ru', 'de', 'es']) {
    const catalog = JSON.parse(
      readFileSync(resolve(`src/shared/i18n/locales/${locale}.json`), 'utf8')
    )
    for (const key of keys) expect(catalog.renderer[key], `${locale}: ${key}`).toBeTruthy()
  }
})
it('shows monthly USD prices and admin activation without a fake checkout or plan switch', async () => {
  const host = document.createElement('div'),
    root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <MembershipPanel
          membership={{ plan: 'plus', status: 'active', validUntil: Date.now() + 86400000 }}
        />
      )
    )
    expect(host.textContent).toContain('Current plan: Plus')
    expect(host.textContent).toContain('$20')
    expect(host.textContent).toContain('$100')
    expect(host.textContent).toContain('USD / month')
    expect(host.textContent).toContain('administrator')
    expect(host.querySelectorAll('button')).toHaveLength(0)
    await act(async () =>
      root.render(
        <MembershipPanel
          membership={{ plan: 'free', status: 'expired', validUntil: Date.now() - 1 }}
        />
      )
    )
    expect(host.textContent).toContain('Membership expired')
    expect(host.textContent).toContain('Current plan: Free')
  } finally {
    await act(async () => root.unmount())
  }
})
