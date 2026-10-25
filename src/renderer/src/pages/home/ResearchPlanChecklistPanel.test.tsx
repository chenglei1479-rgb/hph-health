// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { initI18n } from '@/i18n'
import { S34_2_RESEARCH_DESIGN_CHECKLIST } from '../../../../shared/s34-disclaimers'
import { ResearchPlanChecklistPanel } from './ResearchPlanChecklistPanel'

let root: Root | null = null
let host: HTMLDivElement | null = null

const renderPanel = async (projectId?: string): Promise<void> => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(<ResearchPlanChecklistPanel projectId={projectId} />)
  })
}

const unmount = async (): Promise<void> => {
  if (root) await act(async () => root?.unmount())
  host?.remove()
  root = null
  host = null
}

const setCheck = async (itemTestId: string, state: string): Promise<void> => {
  const select = host?.querySelector<HTMLSelectElement>(`[data-testid="${itemTestId}"] select`)
  expect(select).not.toBeNull()
  await act(async () => {
    if (!select) return
    select.value = state
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

beforeEach(() => {
  initI18n('en')
  localStorage.clear()
})

afterEach(async () => {
  await unmount()
})

it('shows the four mentor-prep blocks with the ① disclaimer', async () => {
  await renderPanel('project-1')
  const blocks = host?.querySelectorAll('[data-testid^="s34-plan-block-"]')
  expect([...(blocks ?? [])].map((node) => node.getAttribute('data-testid'))).toEqual([
    's34-plan-block-design',
    's34-plan-block-pitfalls',
    's34-plan-block-endpoints',
    's34-plan-block-confounding'
  ])
  expect(host?.querySelector('[data-testid="s34-plan-disclaimer"]')?.textContent).toBe(
    S34_2_RESEARCH_DESIGN_CHECKLIST
  )
  expect(host?.textContent).toContain('よく落ちる点のチェックリスト')
})

it('keeps the ② first screen at 12 items and reveals the 13th with show more', async () => {
  await renderPanel('project-1')
  const pitfalls = host?.querySelector('[data-testid="s34-plan-block-pitfalls"]')
  expect(pitfalls?.querySelectorAll('li')).toHaveLength(12)
  const more = host?.querySelector<HTMLButtonElement>('[data-testid="s34-plan-more-pitfalls"]')
  expect(more?.textContent).toBe('Show more')
  await act(async () => more?.click())
  expect(pitfalls?.querySelectorAll('li')).toHaveLength(13)
  expect(host?.querySelector('[data-testid="s34-plan-less-pitfalls"]')).not.toBeNull()
})

it('keeps a check and a memo on this project after a reload', async () => {
  await renderPanel('project-1')
  await setCheck('s34-plan-item-design:retro-cohort', '該当')
  const memo = host?.querySelector<HTMLInputElement>('[data-testid="s34-plan-memo-design"]')
  await act(async () => {
    if (!memo) return
    // React tracks the DOM value; go through the native setter so onChange sees the change.
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setValue?.call(memo, '期間は 2019–2024')
    memo.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await unmount()

  await renderPanel('project-1')
  expect(
    host?.querySelector<HTMLSelectElement>(
      '[data-testid="s34-plan-item-design:retro-cohort"] select'
    )?.value
  ).toBe('該当')
  expect(host?.querySelector<HTMLInputElement>('[data-testid="s34-plan-memo-design"]')?.value).toBe(
    '期間は 2019–2024'
  )
})

it('does not carry answers into another project', async () => {
  await renderPanel('project-1')
  await setCheck('s34-plan-item-design:retro-cohort', '該当')
  await unmount()

  await renderPanel('project-2')
  expect(
    host?.querySelector<HTMLSelectElement>(
      '[data-testid="s34-plan-item-design:retro-cohort"] select'
    )?.value
  ).toBe('未定')
})

it('renders nothing without a project', async () => {
  await renderPanel(undefined)
  expect(host?.querySelector('[data-testid="s34-research-plan-checklist"]')).toBeNull()
})

it('falls back to an empty draft when the stored draft is corrupted', async () => {
  // The panel's beforeEach clears storage, so seed the damage explicitly.
  localStorage.setItem('dra.research-plan-checklist.v1.project-1', '{"checks": ')

  await renderPanel('project-1')

  expect(host?.querySelector('[data-testid="s34-research-plan-checklist"]')).not.toBeNull()
  expect(
    host?.querySelector<HTMLSelectElement>(
      '[data-testid="s34-plan-item-design:retro-cohort"] select'
    )?.value
  ).toBe('未定')
  expect(host?.querySelector<HTMLInputElement>('[data-testid="s34-plan-memo-design"]')?.value).toBe(
    ''
  )
  // A failed read must not erase or rewrite the stored value behind the user's back.
  expect(localStorage.getItem('dra.research-plan-checklist.v1.project-1')).toBe('{"checks": ')
})
