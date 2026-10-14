// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'ja' },
    t: (key: string) => key
  })
}))

import { AccountGate } from '@/components/AccountGate'
import { VARIABLE_DEFINITION_MISSING_KEY_MESSAGE } from '../../../../shared/variable-definition'
import { VariableDefinitionEntry } from './VariableDefinitionEntry'

let root: Root | undefined
let host: HTMLDivElement | undefined

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  host?.remove()
  root = undefined
  host = undefined
  vi.unstubAllEnvs()
})

it('shows the variable-definition entry in a prerelease build without account or membership', async () => {
  vi.stubEnv('DRA_PRERELEASE', '1')
  const getState = vi.fn()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      account: { getState },
      projects: {
        list: async () => [
          {
            id: 'study-1',
            name: '術後感染の研究',
            description: '退院サマリーから判定する。',
            agentContext: ''
          }
        ]
      },
      variableDefinition: {
        generate: vi.fn(async () => {
          throw new Error(VARIABLE_DEFINITION_MISSING_KEY_MESSAGE)
        }),
        exportTemplate: vi.fn()
      }
    }
  })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <AccountGate>
        <VariableDefinitionEntry />
      </AccountGate>
    )
  })
  expect(getState).not.toHaveBeenCalled()
  expect(host.querySelector('[data-testid="membership-panel"]')).toBeNull()
  expect(host.textContent).not.toContain('Loading account')
  const open = [...host.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('変数定義表')
  )
  expect(open).toBeTruthy()
  await act(async () => {
    open?.click()
  })
  await act(async () => {
    await Promise.resolve()
  })
  const select = host.querySelector('select')
  await act(async () => {
    if (!select) return
    select.value = 'study-1'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  const generate = [...host.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('変数定義を作る')
  )
  await act(async () => {
    generate?.click()
  })
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  expect(host.textContent).toContain('API キーが設定されていません')
  expect(host.textContent).toContain('設定の API キー欄')
})
