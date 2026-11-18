// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { initI18n } from '@/i18n'
import { S34_2_RESEARCH_DESIGN_CHECKLIST } from '../../../../shared/s34-disclaimers'
import {
  RESEARCH_PLAN_CHECK_STATES,
  RESEARCH_PLAN_CHECK_STATE_LABELS,
  S34_PITFALLS_TITLE,
  S34_RESEARCH_PLAN_CHECKLIST,
  S34_RESEARCH_PLAN_PANEL_HEADING
} from '../../../../shared/s34-research-plan-checklist'
import { LOCALES, type Locale } from '../../../../shared/locale'
import de from '../../../../shared/i18n/locales/de.json'
import es from '../../../../shared/i18n/locales/es.json'
import fr from '../../../../shared/i18n/locales/fr.json'
import ja from '../../../../shared/i18n/locales/ja.json'
import ko from '../../../../shared/i18n/locales/ko.json'
import ru from '../../../../shared/i18n/locales/ru.json'
import zhHans from '../../../../shared/i18n/locales/zh-Hans.json'
import zhHant from '../../../../shared/i18n/locales/zh-Hant.json'
import { ResearchPlanChecklistPanel } from './ResearchPlanChecklistPanel'
import { checklistDraftKey } from './research-plan-checklist-draft'

const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u

const catalogs = {
  de,
  es,
  fr,
  ja,
  ko,
  ru,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant
} as const

const translated = (locale: Locale, key: string): string =>
  locale === 'en' ? key : (catalogs[locale as Exclude<Locale, 'en'>] as { renderer: Record<string, string> }).renderer[key]

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
  initI18n('en')
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
  expect(host?.textContent).toContain('Common pitfalls checklist')
})

// #261 acceptance: the seed copy is translated in every locale, the Japanese one is the founder's
// original wording, and a non-Japanese UI must not contain a single kana character.
it('renders the translated seed copy in every locale, with no kana outside ja', async () => {
  for (const locale of LOCALES) {
    initI18n(locale)
    await renderPanel('project-1')
    const panel = host?.querySelector('[data-testid="s34-research-plan-checklist"]')
    expect(panel, locale).not.toBeNull()
    const text = panel?.textContent ?? ''

    expect(text, locale).toContain(translated(locale, S34_RESEARCH_PLAN_PANEL_HEADING))
    expect(text, locale).toContain(translated(locale, S34_PITFALLS_TITLE))
    expect(text, locale).toContain(
      translated(locale, S34_RESEARCH_PLAN_CHECKLIST[0]!.items[0]!.label)
    )
    expect(text, locale).toContain(translated(locale, S34_2_RESEARCH_DESIGN_CHECKLIST))
    const options = [...(panel?.querySelectorAll('option') ?? [])].map((option) => option.textContent)
    for (const state of RESEARCH_PLAN_CHECK_STATES) {
      expect(options, `${locale}:${state}`).toContain(
        translated(locale, RESEARCH_PLAN_CHECK_STATE_LABELS[state])
      )
    }

    if (locale !== 'ja') expect(text, locale).not.toMatch(KANA)
    else {
      expect(text).toContain('研究計画の四つの確認')
      expect(text).toContain('よく落ちる点のチェックリスト')
      expect(text).toContain('要確認')
    }
    await unmount()
  }
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
  await setCheck('s34-plan-item-design:retro-cohort', 'applies')
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
  ).toBe('applies')
  expect(host?.querySelector<HTMLInputElement>('[data-testid="s34-plan-memo-design"]')?.value).toBe(
    '期間は 2019–2024'
  )
})

// The state values are stored ids now; a draft written by a build that stored the Japanese labels
// must keep its ticks, and the panel must display them through the current locale.
it('reads a draft that still stores the legacy Japanese state', async () => {
  localStorage.setItem(
    checklistDraftKey('project-1'),
    JSON.stringify({ checks: { 'design:retro-cohort': '該当' }, memos: {} })
  )
  await renderPanel('project-1')
  const select = host?.querySelector<HTMLSelectElement>(
    '[data-testid="s34-plan-item-design:retro-cohort"] select'
  )
  expect(select?.value).toBe('applies')
  expect(select?.selectedOptions[0]?.textContent).toBe('Applies')
})

it('does not carry answers into another project', async () => {
  await renderPanel('project-1')
  await setCheck('s34-plan-item-design:retro-cohort', 'applies')
  await unmount()

  await renderPanel('project-2')
  expect(
    host?.querySelector<HTMLSelectElement>(
      '[data-testid="s34-plan-item-design:retro-cohort"] select'
    )?.value
  ).toBe('unset')
})

it('renders nothing without a project', async () => {
  await renderPanel(undefined)
  expect(host?.querySelector('[data-testid="s34-research-plan-checklist"]')).toBeNull()
})

it('falls back to an empty draft when the stored draft is corrupted', async () => {
  // The panel's beforeEach clears storage, so seed the damage explicitly. The key comes from the
  // module, so a prefix bump cannot leave this test passing without exercising the same read path.
  const corrupted = '{"checks": '
  localStorage.setItem(checklistDraftKey('project-1'), corrupted)

  await renderPanel('project-1')

  expect(host?.querySelector('[data-testid="s34-research-plan-checklist"]')).not.toBeNull()
  expect(
    host?.querySelector<HTMLSelectElement>(
      '[data-testid="s34-plan-item-design:retro-cohort"] select'
    )?.value
  ).toBe('unset')
  expect(host?.querySelector<HTMLInputElement>('[data-testid="s34-plan-memo-design"]')?.value).toBe(
    ''
  )
  // A failed read must not erase or rewrite the stored value behind the user's back.
  expect(localStorage.getItem(checklistDraftKey('project-1'))).toBe(corrupted)
})
