// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'

import { initI18n } from '../../i18n'
import { createInitialProjectState, useProjectStore } from '@/stores/project-store'
import { LOCALES, type Locale } from '../../../../shared/locale'
import { MENTOR_PACK_MODE_LINE } from '../../../../shared/deliverable-pack-policy'
import { S34_2_RESEARCH_DESIGN_CHECKLIST } from '../../../../shared/s34-disclaimers'
import { MentorPackComposerNotice } from './MentorPackComposerNotice'

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

it('shows the §34.2 ① research-design checklist verbatim in the mentor-pack composer notice in every locale', async () => {
  for (const locale of LOCALES) {
    await renderNotice(MENTOR_PACK_MODE_LINE, locale)
    const notice = document.body.querySelector('[data-testid="mentor-pack-input-notice"]')
    expect(notice, locale).not.toBeNull()
    const disclaimers = document.body.querySelectorAll(
      '[data-testid="s34-disclaimer-research-design"]'
    )
    expect(disclaimers, locale).toHaveLength(1)
    expect(disclaimers[0]?.textContent, locale).toBe(S34_2_RESEARCH_DESIGN_CHECKLIST)
    expect(notice?.contains(disclaimers[0]!), locale).toBe(true)
    await unmount()
  }
})

it('does not show the ① checklist outside the mentor pack', async () => {
  for (const agentContext of ['Workflow mode: analysis', 'Package mode: writing-pack']) {
    await renderNotice(agentContext)
    expect(document.body.querySelector('[data-testid="mentor-pack-input-notice"]')).toBeNull()
    expect(document.body.querySelector('[data-testid="s34-disclaimer-research-design"]')).toBeNull()
    await unmount()
  }
})
