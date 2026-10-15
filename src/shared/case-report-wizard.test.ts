import { describe, expect, it } from 'vitest'

import {
  acknowledgeCaseReportStep,
  CASE_REPORT_STEP_IDS,
  emptyCaseReportWizardRecord,
  nextCaseReportStep,
  parseCaseReportWizardRecord,
  skipCaseReportStep
} from './case-report-wizard'

describe('case report wizard record', () => {
  it('keeps a skip or acknowledgement for every step', () => {
    let record = emptyCaseReportWizardRecord()
    expect(nextCaseReportStep(record)).toBe('presentation')
    record = skipCaseReportStep(record, 'presentation')
    record = acknowledgeCaseReportStep(record, 'course')
    record = skipCaseReportStep(record, 'discussion')
    record = skipCaseReportStep(record, 'consent')
    expect(record).toEqual({
      skippedStepIds: ['presentation', 'discussion', 'consent'],
      acknowledgedStepIds: ['course']
    })
    expect(nextCaseReportStep(record)).toBeUndefined()
    expect(skipCaseReportStep(record, 'course').acknowledgedStepIds).toEqual([])
    expect(acknowledgeCaseReportStep(record, 'presentation').skippedStepIds).not.toContain(
      'presentation'
    )
  })

  it('drops unknown ids and lets a skip replace an acknowledgement', () => {
    expect(
      parseCaseReportWizardRecord({
        skippedStepIds: ['course', 'not-a-step', 'course'],
        acknowledgedStepIds: ['course', 'consent', 3]
      })
    ).toEqual({
      skippedStepIds: ['course'],
      acknowledgedStepIds: ['consent']
    })
    expect(parseCaseReportWizardRecord(null)).toEqual(emptyCaseReportWizardRecord())
    expect(CASE_REPORT_STEP_IDS).toEqual(['presentation', 'course', 'discussion', 'consent'])
  })
})
