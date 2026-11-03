// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useLocaleStore } from '@/stores/locale-store'

import { i18next, initI18n } from '../../i18n'
import { VariableDefinitionEntry } from './VariableDefinitionEntry'

describe('VariableDefinitionEntry', () => {
  let root: Root | null = null
  let container: HTMLDivElement | null = null

  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    root = null
    container = null
    initI18n('en')
  })

  it('shows the separated Japanese entry and fills the plan from the project', async () => {
    useLocaleStore.setState({ preference: 'ja', locale: 'ja' })
    const generate = vi.fn(async () => ({
      projectId: 'study-1',
      variables: [
        {
          name: '術後感染',
          definition: '手術後30日以内の手術部位感染',
          recordType: '経過記録',
          coding: 'あり=1/なし=0',
          type: 'binary' as const,
          allowedRange: '0-1'
        }
      ],
      warnings: [
        {
          code: 'dropped-identifier' as const,
          name: 'カルテ番号',
          message:
            '「カルテ番号」は直接識別子（カルテ番号）のため、収集テンプレートから除きました。'
        }
      ]
    }))
    window.api = {
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
        // #134: the panel asks before it renders the form.
        getAvailability: async () => ({
          status: 'ready',
          providerId: 'openai',
          providerLabel: 'OpenAI',
          modelId: 'gpt-test'
        }),
        generate,
        exportTemplate: vi.fn()
      }
    } as unknown as Window['api']
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(<VariableDefinitionEntry />)
    })
    expect(container.textContent).toContain('変数定義表')
    const open = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('変数定義表')
    )
    await act(async () => {
      open?.click()
    })
    await act(async () => {
      await Promise.resolve()
    })
    const select = container.querySelector('select')
    await act(async () => {
      if (!select) return
      select.value = 'study-1'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const plan = container.querySelector('textarea')
    expect(plan?.value).toContain('術後感染の研究')
    expect(plan?.value).toContain('退院サマリー')
    const generateButton = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('変数定義を作る')
    )
    await act(async () => {
      generateButton?.click()
    })
    await act(async () => {
      await generate.mock.results[0]?.value
    })
    expect(generate).toHaveBeenCalledWith({
      projectId: 'study-1',
      researchPlan: expect.stringContaining('退院サマリー')
    })
    expect(container.textContent).toContain('経過記録')
    expect(container.textContent).toContain('収集テンプレートから除きました')
    expect(container.textContent).toContain('交付パッケージが使えるようになったら')
    expect(container.textContent).toContain('マスキングチェック')
    expect(container.textContent).toContain('仮名化済み')
    expect(container.textContent).not.toContain('匿名化')
  })

  const openWithAvailability = async (
    getAvailability: () => Promise<unknown>
  ): Promise<HTMLDivElement> => {
    initI18n('ja')
    await act(async () => {
      await i18next.changeLanguage('ja')
    })
    useLocaleStore.setState({ preference: 'ja', locale: 'ja' })
    window.api = {
      projects: {
        list: async () => [
          { id: 'study-1', name: '術後感染の研究', description: '', agentContext: '' }
        ]
      },
      variableDefinition: {
        getAvailability,
        generate: vi.fn(),
        exportTemplate: vi.fn()
      }
    } as unknown as Window['api']
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(<VariableDefinitionEntry />)
    })
    const open = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('変数定義表')
    )
    await act(async () => {
      open?.click()
    })
    await act(async () => {
      await Promise.resolve()
    })
    return container
  }

  // #134: the requirement is settled before the form exists. "Not configured" is not a failure —
  // the feature simply is not available yet — so the panel shows what to add, not an error.
  it('shows no form at all when no model provider is configured', async () => {
    const host = await openWithAvailability(async () => ({
      status: 'not-configured',
      missing: 'provider'
    }))

    expect(host.querySelector('select')).toBeNull()
    expect(host.querySelector('textarea')).toBeNull()
    expect(host.textContent).toContain('変数定義には、モデルの設定が必要です。')
    expect(host.textContent).toContain('モデルのプロバイダーが設定されていません')
    expect(host.textContent).toContain('設定 > モデル')
  })

  it('asks for a model when the provider has none', async () => {
    const host = await openWithAvailability(async () => ({
      status: 'not-configured',
      missing: 'model'
    }))

    expect(host.querySelector('textarea')).toBeNull()
    expect(host.textContent).toContain('選択中のプロバイダーにモデルがありません')
    expect(host.textContent).not.toContain('モデルのプロバイダーが設定されていません')
  })

  // "Configured but unusable" needs a different next step from "nothing configured": check the
  // provider, do not add another one.
  it('tells a configured but unusable provider apart from an unconfigured one', async () => {
    const host = await openWithAvailability(async () => ({
      status: 'unavailable',
      code: 'model-requirement-provider-rejected'
    }))

    expect(host.querySelector('textarea')).toBeNull()
    expect(host.textContent).toContain('設定されているプロバイダーは、ここでは使用できません')
    expect(host.textContent).toContain('model-requirement-provider-rejected')
    expect(host.textContent).not.toContain('モデルのプロバイダーが設定されていません')
  })

  it('offers a retry when the settings could not be read, and shows the form once ready', async () => {
    const getAvailability = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('unreadable'))
      .mockResolvedValueOnce({
        status: 'ready',
        providerId: 'openai',
        providerLabel: 'Azure OpenAI',
        modelId: 'gpt-test'
      })
    const host = await openWithAvailability(getAvailability)

    expect(host.querySelector('textarea')).toBeNull()
    expect(host.textContent).toContain('モデルの設定を読み取れませんでした')
    expect(host.textContent).toContain('model-requirement-settings-unreadable')

    const recheck = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === '再確認'
    )
    await act(async () => {
      recheck?.click()
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(host.querySelector('textarea')).not.toBeNull()
    expect(host.textContent).toContain('Azure OpenAI / gpt-test')
    expect(getAvailability).toHaveBeenCalledTimes(2)
  })
})
