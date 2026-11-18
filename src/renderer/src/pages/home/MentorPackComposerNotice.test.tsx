// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'

import { initI18n } from '../../i18n'
import { createInitialProjectState, useProjectStore } from '@/stores/project-store'
import { LOCALES, type Locale } from '../../../../shared/locale'
import { MENTOR_PACK_MODE_LINE } from '../../../../shared/deliverable-pack-policy'
import { S34_2_RESEARCH_DESIGN_CHECKLIST } from '../../../../shared/s34-disclaimers'
import de from '../../../../shared/i18n/locales/de.json'
import es from '../../../../shared/i18n/locales/es.json'
import fr from '../../../../shared/i18n/locales/fr.json'
import ja from '../../../../shared/i18n/locales/ja.json'
import ko from '../../../../shared/i18n/locales/ko.json'
import ru from '../../../../shared/i18n/locales/ru.json'
import zhHans from '../../../../shared/i18n/locales/zh-Hans.json'
import zhHant from '../../../../shared/i18n/locales/zh-Hant.json'
import { MentorPackComposerNotice } from './MentorPackComposerNotice'

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
  locale === 'en'
    ? key
    : (catalogs[locale as Exclude<Locale, 'en'>] as { renderer: Record<string, string> }).renderer[
        key
      ]

const PROJECT_ID = 'project-1'

let root: Root | null = null
let host: HTMLDivElement | null = null

const unmount = async (): Promise<void> => {
  await act(async () => root?.unmount())
  host?.remove()
  root = null
  host = null
}

afterEach(async () => {
  await unmount()
  useProjectStore.setState(createInitialProjectState())
  initI18n('en')
})

const renderNotice = async (agentContext: string, locale: Locale = 'en'): Promise<void> => {
  initI18n(locale)
  useProjectStore.setState({
    ...createInitialProjectState(),
    projects: [
      {
        id: PROJECT_ID,
        name: 'Study',
        description: '',
        isExample: false,
        agentContext,
        createdAt: 1,
        updatedAt: 1
      }
    ],
    isLoaded: true
  })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(<MentorPackComposerNotice sessionProjectId={PROJECT_ID} />)
  })
}

it('keeps the existing mentor-pack hard rule and input notice', async () => {
  await renderNotice(MENTOR_PACK_MODE_LINE)
  const notice = document.body.querySelector('[data-testid="mentor-pack-input-notice"]')
  expect(notice?.textContent).toContain('This pack does not load patient data.')
  expect(notice?.textContent).toContain(
    'Do not paste individual patient data. Keep the consultation to the study design and a summary of aggregate results.'
  )
})

// #261: the ① disclaimer is translated copy now, not the founder's Japanese shown verbatim. The
// Japanese catalog keeps the original wording; every other locale must render a translation and, apart
// from ja itself, the panel must not contain a single kana character.
it('shows the §34.2 ① research-design checklist in the current locale', async () => {
  for (const locale of LOCALES) {
    await renderNotice(MENTOR_PACK_MODE_LINE, locale)
    const notice = document.body.querySelector('[data-testid="mentor-pack-input-notice"]')
    expect(notice, locale).not.toBeNull()
    const disclaimers = document.body.querySelectorAll(
      '[data-testid="s34-disclaimer-research-design"]'
    )
    expect(disclaimers, locale).toHaveLength(1)
    const text = disclaimers[0]?.textContent ?? ''
    expect(text, locale).toBe(translated(locale, S34_2_RESEARCH_DESIGN_CHECKLIST))
    if (locale === 'ja') {
      expect(text).toContain('本機能は、研究デザイン')
      expect(text).not.toBe(S34_2_RESEARCH_DESIGN_CHECKLIST)
    } else {
      expect(text, locale).not.toMatch(KANA)
    }
    expect(notice?.contains(disclaimers[0]!), locale).toBe(true)
    await unmount()
  }
})

it('does not show the ① checklist outside the mentor pack', async () => {
  for (const agentContext of ['Workflow mode: analysis', 'Package mode: writing-pack']) {
    await renderNotice(agentContext)
    expect(document.body.querySelector('[data-testid="mentor-pack-input-notice"]')).toBeNull()
    expect(document.body.querySelector('[data-testid="s34-disclaimer-research-design"]')).toBeNull()
    expect(document.body.querySelector('[data-testid="s34-research-plan-checklist"]')).toBeNull()
    await unmount()
  }
})

it('mounts the T3 four-question checklist inside the mentor pack only', async () => {
  await renderNotice(MENTOR_PACK_MODE_LINE)
  const notice = document.body.querySelector('[data-testid="mentor-pack-input-notice"]')
  const checklist = document.body.querySelector('[data-testid="s34-research-plan-checklist"]')
  expect(checklist).not.toBeNull()
  expect(notice?.contains(checklist!)).toBe(true)
  expect(checklist?.querySelectorAll('[data-testid^="s34-plan-block-"]')).toHaveLength(4)
})
