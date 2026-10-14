// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { VariableDefinitionEntry } from './VariableDefinitionEntry'

describe('VariableDefinitionEntry', () => {
  let root: Root | null = null
  let container: HTMLDivElement | null = null

  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    root = null
    container = null
  })

  it('shows the separated Japanese entry and fills the plan from the project', async () => {
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
  })
})
