// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { initI18n } from '@/i18n'
import { CaseReportTrackWizard } from './CaseReportTrackWizard'
import {
  CASE_REPORT_WIZARD_STORAGE_KEY,
  readCaseReportWizardRecord
} from './case-report-wizard-storage'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('CaseReportTrackWizard', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    initI18n('en')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    localStorage.clear()
  })

  const renderWizard = async (): Promise<void> => {
    await act(async () => root.render(<CaseReportTrackWizard />))
  }

  const click = async (label: string): Promise<void> => {
    const button = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent === label
    )
    expect(button).toBeTruthy()
    await act(async () => button?.click())
  }

  it('lets every step be skipped and restores that choice', async () => {
    await renderWizard()
    for (const label of [
      'Describe the case without direct identifiers.',
      'Record the clinical course.',
      'Note the discussion and literature.',
      'Record consent and ethics review.'
    ]) {
      expect(container.textContent).toContain(label)
      await click('Skip this step')
    }
    expect(container.textContent).toContain('Case report track saved')
    expect(readCaseReportWizardRecord().skippedStepIds).toEqual([
      'presentation',
      'course',
      'discussion',
      'consent'
    ])
    const stored = localStorage.getItem(CASE_REPORT_WIZARD_STORAGE_KEY)
    act(() => root.unmount())
    root = createRoot(container)
    localStorage.setItem(CASE_REPORT_WIZARD_STORAGE_KEY, stored ?? '')
    await renderWizard()
    expect(container.textContent).toContain('Case report track saved')
    expect(container.textContent).toContain('Skipped steps:')
    expect(container.querySelector('button')).toBeNull()
  })

  it('resumes at the first step that has no stored choice', async () => {
    localStorage.setItem(
      CASE_REPORT_WIZARD_STORAGE_KEY,
      JSON.stringify({ skippedStepIds: ['presentation'], acknowledgedStepIds: ['course'] })
    )
    await renderWizard()
    expect(container.querySelector('[data-testid="case-report-step"]')?.textContent).toBe(
      'Note the discussion and literature.'
    )
    await click('Next step')
    expect(container.textContent).toContain('Record consent and ethics review.')
    await click('Finish case report track')
    expect(readCaseReportWizardRecord()).toEqual({
      skippedStepIds: ['presentation'],
      acknowledgedStepIds: ['course', 'discussion', 'consent']
    })
  })
})
