import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  acknowledgeCaseReportStep,
  nextCaseReportStep,
  skipCaseReportStep,
  type CaseReportStepId,
  type CaseReportWizardRecord
} from '../../../../shared/case-report-wizard'
import {
  readCaseReportWizardRecord,
  writeCaseReportWizardRecord
} from './case-report-wizard-storage'

const STEP_COPY: Record<CaseReportStepId, string> = {
  presentation: 'Describe the case without direct identifiers.',
  course: 'Record the clinical course.',
  discussion: 'Note the discussion and literature.',
  consent: 'Record consent and ethics review.'
}

const CaseReportTrackWizard = (): React.JSX.Element => {
  const { t } = useTranslation()
  const [record, setRecord] = useState<CaseReportWizardRecord>(() => readCaseReportWizardRecord())
  const stepId = nextCaseReportStep(record)
  const persist = (next: CaseReportWizardRecord): void => {
    writeCaseReportWizardRecord(next)
    setRecord(next)
  }
  const skippedLabels = record.skippedStepIds.map((id) => t(STEP_COPY[id])).join(', ')

  return (
    <section aria-label={t('Case report track')} className="mt-4" data-testid="case-report-track">
      <h3 className="text-xs font-semibold text-text-000">{t('Case report track')}</h3>
      <p className="mt-1 text-[11px] leading-[1.5] text-text-200">
        {t('This optional case-report track can be skipped at every step.')}
      </p>
      {stepId ? (
        <div className="mt-3">
          <p className="text-[11px] leading-[1.5] text-text-000" data-testid="case-report-step">
            {t(STEP_COPY[stepId])}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border border-border-300 px-2 py-1 text-[11px]"
              onClick={() => persist(skipCaseReportStep(record, stepId))}
            >
              {t('Skip this step')}
            </button>
            <button
              type="button"
              className="rounded-md bg-primary px-2 py-1 text-[11px] text-primary-foreground"
              onClick={() => persist(acknowledgeCaseReportStep(record, stepId))}
            >
              {stepId === 'consent' ? t('Finish case report track') : t('Next step')}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-text-200">{t('Case report track saved')}</p>
      )}
      {skippedLabels ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t('Skipped steps: {{steps}}', { steps: skippedLabels })}
        </p>
      ) : null}
    </section>
  )
}

export { CaseReportTrackWizard }
