import {
  ArrowUpRight,
  BookOpenCheck,
  ChartNoAxesCombined,
  ChevronDown,
  ClipboardCheck,
  FilePenLine,
  Languages,
  Search,
  ShieldCheck,
  type LucideIcon
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import {
  homeBodyClassName,
  homeCardClassName,
  homeCardInteractiveClassName,
  homeIconTileClassName,
  homeMutedClassName,
  homePrimaryColumnClassName,
  homePrimaryGridClassName,
  homeTitleClassName,
  homeWarningClassName
} from './home-layout'
import { homePrimaryEntries, type HomePrimaryEntryId } from './home-primary-entries'
import { nextStepAfter } from '../../../../shared/deliverable-next-step'
import { dismissPackDeliveryHomeCard, usePackDeliveryLedger } from './pack-delivery-ledger'
import { PackNextStepCard } from './PackNextStepCard'
import { SampleAbstractDialog } from './SampleAbstractDialog'
import { useSettingsStore } from '@/stores/settings-store'

// Same cap as CATEGORICAL_RELEASE_LIMIT in the schema-only release path.
// The renderer does not import that main-process module.
export const HOME_CATEGORICAL_VALUE_LIMIT = 12

export type MedicalResearchWorkflow =
  | 'mentor-pack'
  | 'consultation-pack'
  | 'writing-pack'
  | 'novelty'
  | 'evidence'
  | 'protocol'
  | 'analysis'
  | 'manuscript'
  | 'academic-english'

type WorkflowCard = {
  id: MedicalResearchWorkflow
  title: string
  description: string
  icon: LucideIcon
}

type MedicalResearchLaunchpadProps = {
  onSelectWorkflow: (workflow: MedicalResearchWorkflow, theme: string) => void
}

const ENTRY_ICONS: Record<HomePrimaryEntryId, LucideIcon> = {
  'mentor-prep': BookOpenCheck,
  'analyze-data': ChartNoAxesCombined,
  'write-abstract': FilePenLine
}

const MedicalResearchLaunchpad = ({
  onSelectWorkflow
}: MedicalResearchLaunchpadProps): React.JSX.Element => {
  const { t } = useTranslation()
  const seedMode = useSettingsStore((state) => state.seedInvite?.mode ?? 'none')
  const consumeSeedPackage = useSettingsStore((state) => state.consumeSeedPackage)
  const [seedUsageError, setSeedUsageError] = useState<string>()
  const [researchTheme, setResearchTheme] = useState('')
  const [sampleOpen, setSampleOpen] = useState(false)
  const [stepsOpen, setStepsOpen] = useState(false)
  const [patientDataDetailsOpen, setPatientDataDetailsOpen] = useState(false)
  const deliveryLedger = usePackDeliveryLedger()
  const exampleTheme = t(
    'I want to study the treatment effect of immune checkpoint inhibitors in patients with lung cancer.'
  )
  const entries = homePrimaryEntries(t).map((entry) => ({
    ...entry,
    icon: ENTRY_ICONS[entry.id]
  }))
  const workflows: WorkflowCard[] = [
    {
      id: 'novelty',
      title: t('Research novelty check'),
      description: t(
        'Search existing studies and ongoing trials, then map potential research gaps with source links and coverage limits.'
      ),
      icon: Search
    },
    {
      id: 'evidence',
      title: t('Literature review'),
      description: t('Frame a PICO question and build a traceable evidence table.'),
      icon: BookOpenCheck
    },
    {
      id: 'protocol',
      title: t('Study planning'),
      description: t('Convert a research question into an editable study protocol.'),
      icon: ClipboardCheck
    },
    {
      id: 'analysis',
      title: t('Data analysis'),
      description: t(
        'Upload an anonymized CSV, review variables and missingness, approve a statistical plan, then create reproducible tables, figures, and code.'
      ),
      icon: ChartNoAxesCombined
    },
    {
      id: 'manuscript',
      title: t('Manuscript writing'),
      description: t('Draft from verified sources and real study results.'),
      icon: FilePenLine
    },
    {
      id: 'academic-english',
      title: t('Academic English writing'),
      description: t(
        'Convert Japanese research notes into section-aware academic English; preserve meaning and flag missing context.'
      ),
      icon: Languages
    }
  ]
  const selectWorkflow = (workflow: MedicalResearchWorkflow, theme: string): void => {
    if (seedMode !== 'company' || workflow === 'novelty' || workflow === 'evidence') {
      onSelectWorkflow(workflow, theme)
      return
    }
    setSeedUsageError(undefined)
    void consumeSeedPackage()
      .then(() => onSelectWorkflow(workflow, theme))
      .catch(() =>
        setSeedUsageError(
          t(
            'You have used up the seed invite AI allowance. To continue, register your own OpenAI API key, or consider a paid plan when it becomes available. Demo (fictional data) and literature search keep working. In the beta, use fictional data only; hospital operations and real data are out of scope.'
          )
        )
      )
  }
  const themeReady = researchTheme.trim().length > 0

  return (
    <section
      className="mt-4 flex w-full min-w-0 flex-col gap-4"
      aria-label={t('Medical research workflows')}
    >
      <div className={cn(homeCardClassName, 'flex flex-col gap-3 p-4')}>
        <p data-testid="entry-step-1" className={homeMutedClassName}>
          <span>{t('Step 1')}</span>
          <span aria-hidden="true"> · </span>
          <span>{t('Project setup')}</span>
        </p>
        <div className="flex flex-col gap-2">
          <h1 className={homeTitleClassName}>{t('Enter your research theme')}</h1>
          <p className={homeBodyClassName}>{t('Research use only')}</p>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="medical-research-theme" className={homeBodyClassName}>
            {t('Research theme')}
          </label>
          <Textarea
            id="medical-research-theme"
            value={researchTheme}
            onChange={(event) => setResearchTheme(event.target.value)}
            placeholder={t('Type a clinical question or research topic…')}
            maxLength={2000}
            rows={1}
            className="min-h-12 resize-y rounded-xl border-border-200 bg-bg-000 px-4 py-3 text-sm font-normal leading-5 text-text-000 placeholder:text-text-300 focus-visible:border-ring"
          />
          <div className={cn(homeMutedClassName, 'flex flex-wrap items-baseline gap-x-2 gap-y-1')}>
            <span className="shrink-0">{t('Try this example:')}</span>
            <button
              type="button"
              onClick={() => setResearchTheme(exampleTheme)}
              className="cursor-pointer text-left font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:text-primary/80 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {exampleTheme}
            </button>
          </div>
        </div>
        <p className={homeMutedClassName}>{t('Review project memory in Settings > Memory.')}</p>
      </div>

      <section
        data-testid="entry-step-2"
        aria-label={t('Choose where to begin')}
        className="flex w-full min-w-0 flex-col gap-4"
      >
        <div className="flex flex-col gap-1">
          <p className={homeMutedClassName}>
            <span>{t('Step 2')}</span>
            <span aria-hidden="true"> · </span>
            <span>{t('Choose where to begin')}</span>
          </p>
          <h2 className={homeTitleClassName}>{t('Choose where to begin')}</h2>
        </div>
        <div className={homePrimaryGridClassName} data-testid="home-primary-entries">
          {entries.map(({ id, workflow, title, description, hardRule, icon: Icon }) => (
            <div key={id} className={homePrimaryColumnClassName}>
              <button
                type="button"
                data-testid={`home-entry-${id}`}
                data-home-entry={id}
                disabled={!themeReady}
                onClick={() => selectWorkflow(workflow, researchTheme.trim())}
                className={cn(homeCardInteractiveClassName, 'min-h-44')}
              >
                <span className="flex w-full items-start justify-between gap-4">
                  <span className={homeIconTileClassName}>
                    <Icon className="size-4" strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <ArrowUpRight
                    className="mt-1 size-4 text-primary/70 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                </span>
                <span className={cn(homeBodyClassName, 'mt-4 min-w-0 [overflow-wrap:anywhere]')}>
                  {title}
                </span>
                <span
                  data-testid={`home-entry-description-${id}`}
                  className={cn(homeMutedClassName, 'mt-2 min-w-0 [overflow-wrap:anywhere]')}
                >
                  {description}
                </span>
                {hardRule ? (
                  <span
                    data-testid={
                      id === 'mentor-prep' ? 'mentor-pack-hard-rule' : `home-entry-boundary-${id}`
                    }
                    className={cn(
                      homeMutedClassName,
                      'mt-auto min-h-[3.25rem] pt-3 min-w-0 [overflow-wrap:anywhere]'
                    )}
                  >
                    {hardRule}
                  </span>
                ) : null}
              </button>
            </div>
          ))}
        </div>
        <div
          data-testid="home-patient-data-note"
          className={cn(homeMutedClassName, 'flex w-full min-w-0 flex-col gap-2 text-left')}
        >
          <p className="w-full min-w-0">
            <span data-testid="home-patient-data-note-text">
              {t(
                'Pre-send checks and restrictions help prevent sending direct identifiers such as names and patient IDs. This is not an absolute guarantee.'
              )}
            </span>{' '}
            <Popover open={patientDataDetailsOpen} onOpenChange={setPatientDataDetailsOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  data-testid="home-patient-data-details"
                  className="cursor-pointer font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:text-primary/80 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {t('Details', { context: 'privacy' })}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                data-testid="home-patient-data-details-panel"
                className="w-[min(36rem,calc(100vw-2rem))] rounded-2xl bg-bg-000 p-4 text-left text-xs font-normal leading-5 text-text-300 shadow-card"
              >
                <p data-testid="s34-disclaimer-research-design">
                  {t(
                    'This checklist supports study-design review; it does not guarantee journal acceptance. You and your mentor make the final decision.'
                  )}
                </p>
                {t(
                  'For a selected column, at most {{limit}} category values are sent, most frequent first; the rest are omitted.',
                  {
                    limit: HOME_CATEGORICAL_VALUE_LIMIT
                  }
                )}
              </PopoverContent>
            </Popover>
          </p>
        </div>
        {deliveryLedger.lastCompletionId && !deliveryLedger.homeCardDismissed ? (
          <PackNextStepCard
            completionId={deliveryLedger.lastCompletionId}
            continueDisabled={!themeReady}
            onDismiss={dismissPackDeliveryHomeCard}
            onContinue={() => {
              const step = nextStepAfter(deliveryLedger.lastCompletionId!)
              if (!step || step.kind !== 'available' || !themeReady) return
              selectWorkflow(step.id, researchTheme.trim())
            }}
          />
        ) : null}
      </section>
      {seedUsageError ? (
        <div role="alert" className={cn(homeWarningClassName, 'rounded-2xl bg-bg-200 p-4')}>
          {seedUsageError}
        </div>
      ) : null}
      <SampleAbstractDialog open={sampleOpen} onClose={() => setSampleOpen(false)} />

      <div data-testid="home-secondary-actions" className="flex w-full min-w-0 flex-col gap-2">
        <button
          type="button"
          data-testid="open-fictional-sample"
          onClick={() => setSampleOpen(true)}
          className="group flex w-full cursor-pointer flex-col items-start gap-1 rounded-lg py-2 text-left hover:bg-bg-200 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <span
            className={cn(
              homeBodyClassName,
              'text-primary underline-offset-2 group-hover:underline'
            )}
          >
            {t('Fictional sample abstract')}
          </span>
          <span className={homeMutedClassName}>
            {t('Open the fictional sample. No model call and no API key.')}
          </span>
        </button>
        <button
          type="button"
          data-testid="start-from-step"
          aria-expanded={stepsOpen}
          aria-controls="research-step-entries"
          onClick={() => setStepsOpen((open) => !open)}
          className="flex w-full cursor-pointer items-center gap-2 rounded-lg py-2 text-left text-sm font-medium leading-5 text-primary hover:bg-bg-200 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-primary transition-transform',
              stepsOpen && 'rotate-180'
            )}
            strokeWidth={1.8}
            aria-hidden="true"
          />
          {/* JA packs the whole label into one unbroken run, so allow it to break inside the row
              instead of pushing the chevron off the control. */}
          <span className="min-w-0 [overflow-wrap:anywhere]">
            {t('Start from a step (literature, planning, analysis, and more)')}
          </span>
        </button>
      </div>

      {stepsOpen ? (
        <div
          id="research-step-entries"
          data-testid="research-step-entries"
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1">
            <h2 className={homeTitleClassName}>{t('Choose where to begin')}</h2>
            <p className={homeMutedClassName}>
              {t('Each stage pauses for researcher confirmation before the workflow continues.')}
            </p>
          </div>

          <div className="flex flex-col divide-y divide-border-200">
            {workflows.map(({ id, title, icon: Icon }) => (
              <button
                key={id}
                type="button"
                data-testid={`research-entry-${id}`}
                disabled={!themeReady}
                onClick={() =>
                  selectWorkflow(
                    id === 'analysis'
                      ? (entries.find((entry) => entry.id === 'analyze-data')?.workflow ?? id)
                      : id,
                    researchTheme.trim()
                  )
                }
                className="flex w-full min-w-0 items-center gap-3 rounded-lg px-2 py-3 text-left hover:bg-bg-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className={homeBodyClassName}>{title}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div
        data-testid="research-use-disclaimer"
        className="flex w-full min-w-0 items-start gap-2 rounded-2xl bg-bg-200 px-4 py-4"
      >
        <ShieldCheck
          className="mt-0.5 size-4 shrink-0 text-text-300"
          strokeWidth={1.8}
          aria-hidden="true"
        />
        <p className={homeMutedClassName}>
          {t(
            'For academic research only; not for diagnosis or treatment. Use fictional data only. Do not upload identifiable patient information. Researchers must verify sources, methods, and outputs.'
          )}
        </p>
      </div>
    </section>
  )
}

export { MedicalResearchLaunchpad }
