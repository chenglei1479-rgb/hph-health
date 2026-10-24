// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'

import { PRERELEASE_DATA_DESTINATION_NOTICE } from '../../../shared/prerelease'
import { i18next, initI18n } from '../i18n'
import { createEmptyProviderFormValue } from '../pages/settings/provider-form-value'
import { ProviderForm } from '../pages/settings/ProviderForm'
import { PrereleaseFirstModelCallNotice } from './PrereleaseFirstModelCallNotice'
import {
  requestPrereleaseModelCallNotice,
  resetPrereleaseModelCallNoticeForTests
} from '../lib/prerelease-model-call-notice'

let root: Root | undefined
let host: HTMLDivElement | undefined

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  host?.remove()
  root = undefined
  host = undefined
  resetPrereleaseModelCallNoticeForTests()
  vi.unstubAllEnvs()
})

const render = async (node: ReactNode): Promise<void> => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root?.render(node))
}

it('keeps the fictional-data sentence next to the provider API key on a beta build', async () => {
  vi.stubEnv('DRA_PRERELEASE', '1')
  await render(
    <ProviderForm
      value={createEmptyProviderFormValue({ type: 'official', vendorId: 'openai' })}
      onChange={() => undefined}
    />
  )
  const key = host?.querySelector<HTMLInputElement>('[aria-label="API key"]')
  const notice = host?.querySelector('[data-testid="prerelease-provider-key-notice"]')
  expect(key).not.toBeNull()
  expect(notice?.textContent).toBe(PRERELEASE_DATA_DESTINATION_NOTICE)
  expect(key?.getAttribute('aria-describedby')).toBe('prerelease-provider-key-notice')
  expect(notice?.parentElement).toBe(key?.parentElement?.parentElement)
})

it('hides the provider-key sentence on a stable build', async () => {
  await render(
    <ProviderForm
      value={createEmptyProviderFormValue({ type: 'official', vendorId: 'openai' })}
      onChange={() => undefined}
    />
  )
  expect(host?.querySelector('[data-testid="prerelease-provider-key-notice"]')).toBeNull()
  expect(host?.querySelector('[aria-label="API key"]')?.getAttribute('aria-describedby')).toBeNull()
})

it('shows the canonical destination sentence in the active locale, not a fixed Japanese one', async () => {
  initI18n('ja')
  vi.stubEnv('DRA_PRERELEASE', '1')
  try {
    await act(async () => {
      await i18next.changeLanguage('ja')
    })
    await render(
      <ProviderForm
        value={createEmptyProviderFormValue({ type: 'official', vendorId: 'openai' })}
        onChange={() => undefined}
      />
    )
    expect(host?.querySelector('[data-testid="prerelease-provider-key-notice"]')?.textContent).toBe(
      '架空データのみ。リクエストは設定した AI サービス（OpenAI の場合は米国）へ送信されます。利用料金はご自身の契約先から請求されます。'
    )
  } finally {
    initI18n('en')
    await act(async () => {
      await i18next.changeLanguage('en')
    })
  }
})

it('shows the same sentence on the first model call and lets that call continue', async () => {
  vi.stubEnv('DRA_PRERELEASE', '1')
  const send = vi.fn()
  const attempt = (): void => {
    if (requestPrereleaseModelCallNotice(attempt)) return
    send()
  }
  await render(<PrereleaseFirstModelCallNotice />)
  expect(host?.querySelector('[data-testid="prerelease-first-model-call"]')).toBeNull()

  await act(async () => {
    attempt()
  })
  const dialog = host?.querySelector('[data-testid="prerelease-first-model-call"]')
  expect(dialog?.textContent).toContain(PRERELEASE_DATA_DESTINATION_NOTICE)
  expect(send).not.toHaveBeenCalled()

  await act(async () => {
    host?.querySelector('button')?.click()
  })
  expect(send).toHaveBeenCalledOnce()
  expect(host?.querySelector('[data-testid="prerelease-first-model-call"]')).toBeNull()
  expect(requestPrereleaseModelCallNotice(vi.fn())).toBe(false)
})
