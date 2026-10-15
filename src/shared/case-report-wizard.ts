// Optional case-report (症例報告) track. Each step can be skipped or acknowledged, and the record
// is the only thing the UI persists.

export const CASE_REPORT_STEP_IDS = ['presentation', 'course', 'discussion', 'consent'] as const
export type CaseReportStepId = (typeof CASE_REPORT_STEP_IDS)[number]

export type CaseReportWizardRecord = {
  skippedStepIds: CaseReportStepId[]
  acknowledgedStepIds: CaseReportStepId[]
}

const isStepId = (value: unknown): value is CaseReportStepId =>
  typeof value === 'string' && (CASE_REPORT_STEP_IDS as readonly string[]).includes(value)

const ordered = (ids: ReadonlySet<CaseReportStepId>): CaseReportStepId[] =>
  CASE_REPORT_STEP_IDS.filter((id) => ids.has(id))

export const emptyCaseReportWizardRecord = (): CaseReportWizardRecord => ({
  skippedStepIds: [],
  acknowledgedStepIds: []
})

export const parseCaseReportWizardRecord = (value: unknown): CaseReportWizardRecord => {
  if (!value || typeof value !== 'object') return emptyCaseReportWizardRecord()
  const record = value as { skippedStepIds?: unknown; acknowledgedStepIds?: unknown }
  const skipped = new Set(
    Array.isArray(record.skippedStepIds) ? record.skippedStepIds.filter(isStepId) : []
  )
  const acknowledged = new Set(
    (Array.isArray(record.acknowledgedStepIds)
      ? record.acknowledgedStepIds.filter(isStepId)
      : []
    ).filter((id) => !skipped.has(id))
  )
  return {
    skippedStepIds: ordered(skipped),
    acknowledgedStepIds: ordered(acknowledged)
  }
}

const remember = (
  record: CaseReportWizardRecord,
  id: CaseReportStepId,
  bucket: 'skippedStepIds' | 'acknowledgedStepIds'
): CaseReportWizardRecord => {
  const other = bucket === 'skippedStepIds' ? 'acknowledgedStepIds' : 'skippedStepIds'
  const selected = new Set(record[bucket])
  selected.add(id)
  const rest = new Set(record[other])
  rest.delete(id)
  return bucket === 'skippedStepIds'
    ? { skippedStepIds: ordered(selected), acknowledgedStepIds: ordered(rest) }
    : { skippedStepIds: ordered(rest), acknowledgedStepIds: ordered(selected) }
}

export const skipCaseReportStep = (
  record: CaseReportWizardRecord,
  id: CaseReportStepId
): CaseReportWizardRecord => remember(record, id, 'skippedStepIds')

export const acknowledgeCaseReportStep = (
  record: CaseReportWizardRecord,
  id: CaseReportStepId
): CaseReportWizardRecord => remember(record, id, 'acknowledgedStepIds')

export const nextCaseReportStep = (record: CaseReportWizardRecord): CaseReportStepId | undefined =>
  CASE_REPORT_STEP_IDS.find(
    (id) => !record.skippedStepIds.includes(id) && !record.acknowledgedStepIds.includes(id)
  )
