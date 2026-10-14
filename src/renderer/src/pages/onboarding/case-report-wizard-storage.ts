import {
  emptyCaseReportWizardRecord,
  parseCaseReportWizardRecord,
  type CaseReportWizardRecord
} from '../../../../shared/case-report-wizard'

export const CASE_REPORT_WIZARD_STORAGE_KEY = 'dra-case-report-wizard'

export const readCaseReportWizardRecord = (): CaseReportWizardRecord => {
  try {
    const raw = localStorage.getItem(CASE_REPORT_WIZARD_STORAGE_KEY)
    return parseCaseReportWizardRecord(raw ? JSON.parse(raw) : undefined)
  } catch {
    return emptyCaseReportWizardRecord()
  }
}

export const writeCaseReportWizardRecord = (record: CaseReportWizardRecord): void => {
  try {
    localStorage.setItem(CASE_REPORT_WIZARD_STORAGE_KEY, JSON.stringify(record))
  } catch {
    // The choice still applies for this session when storage is unavailable.
  }
}
