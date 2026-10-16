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

import { relativeTimeParts, type RelativeTimeUnit } from '@/lib/format-relative-time'
import { cn } from '@/lib/utils'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { DeleteLocalCopiesButton } from './DeleteLocalCopies'
import { homePrimaryEntries, type HomePrimaryEntryId } from './home-primary-entries'
import { nextStepAfter } from '../../../../shared/deliverable-next-step'
import { dismissPackDeliveryHomeCard, usePackDeliveryLedger } from './pack-delivery-ledger'
import { PackNextStepCard } from './PackNextStepCard'
import { SampleAbstractDialog } from './SampleAbstractDialog'

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
  iconClassName: string
}

export type RecentHomeProject = {
  id: string
  name: string
  /** Epoch milliseconds of the latest project or session activity. */
  updatedAt?: number
}

const RECENT_PROJECT_PREVIEW_COUNT = 4

// Same compact buckets as the home session rows ("3d" / "3 天前"). The unit is a runtime value, so
// it maps to English text rather than being interpolated into a key.
const COMPACT_ELAPSED = {
  minute: '{{count}}m',
  hour: '{{count}}h',
  day: '{{count}}d',
  week: '{{count}}w',
  month: '{{count}}mo',
  year: '{{count}}y'
} as const satisfies Record<Exclude<RelativeTimeUnit, 'now'>, string>

const recentProjectCardClassName =
  'flex h-24 w-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-2xl border border-border-200/70 bg-bg-000 px-4 py-3 text-left shadow-card transition-colors hover:bg-bg-200 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

type MedicalResearchLaunchpadProps = {
  onSelectWorkflow: (workflow: MedicalResearchWorkflow, theme: string) => void
  recentProjects?: readonly RecentHomeProject[]
  onOpenProject?: (projectId: string) => void
  canDeleteLocalCopies?: boolean
  localProjectIds?: readonly string[]
  onDeleteLocalCopies?: (projectIds: readonly string[]) => Promise<void>
}

const ENTRY_ICONS: Record<HomePrimaryEntryId, { icon: LucideIcon; iconClassName: string }> = {
  'mentor-prep': { icon: BookOpenCheck, iconClassName: 'bg-[#f3edf1] text-[#78576e]' },
  'analyze-data': { icon: ChartNoAxesCombined, iconClassName: 'bg-[#eef2e9] text-[#58744b]' },
  'write-abstract': { icon: FilePenLine, iconClassName: 'bg-[#edf0f7] text-[#58668a]' }
}

const MedicalResearchLaunchpad = ({
  onSelectWorkflow,
  recentProjects = [],
  onOpenProject = () => undefined,
  canDeleteLocalCopies = true,
  localProjectIds = [],
  onDeleteLocalCopies = async () => undefined
}: MedicalResearchLaunchpadProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [researchTheme, setResearchTheme] = useState('')
  const [sampleOpen, setSampleOpen] = useState(false)
  const [stepsOpen, setStepsOpen] = useState(false)
  const [showAllProjects, setShowAllProjects] = useState(false)
  const deliveryLedger = usePackDeliveryLedger()
  const exampleTheme = t(
    'I want to study the treatment effect of immune checkpoint inhibitors in patients with lung cancer.'
  )
  const entries = homePrimaryEntries(t).map((entry) => ({
    ...entry,
    ...ENTRY_ICONS[entry.id]
  }))
  const workflows: WorkflowCard[] = [
    {
      id: 'novelty',
      title: t('Research novelty check'),
      description: t(
        'Search existing studies and ongoing trials, then map potential research gaps with source links and coverage limits.'
      ),
      icon: Search,
      iconClassName: 'bg-[#f5eee7] text-[#965749]'
    },
    {
      id: 'evidence',
      title: t('Literature review'),
      description: t('Frame a PICO question and build a traceable evidence table.'),
      icon: BookOpenCheck,
      iconClassName: 'bg-[#eef3f4] text-[#315b67]'
    },
    {
      id: 'protocol',
      title: t('Study planning'),
      description: t('Convert a research question into an editable study protocol.'),
      icon: ClipboardCheck,
      iconClassName: 'bg-[#f5eee7] text-[#965749]'
    },
    {
      id: 'analysis',
      title: t('Data analysis'),
      description: t(
        'Upload an anonymized CSV, review variables and missingness, approve a statistical plan, then create reproducible tables, figures, and code.'
      ),
      icon: ChartNoAxesCombined,
      iconClassName: 'bg-[#eef2e9] text-[#58744b]'
    },
    {
      id: 'manuscript',
      title: t('Manuscript writing'),
      description: t('Draft from verified sources and real study results.'),
      icon: FilePenLine,
      iconClassName: 'bg-[#f3edf1] text-[#78576e]'
    },
    {
      id: 'academic-english',
      title: t('Academic English writing'),
      description: t(
        'Convert Japanese research notes into section-aware academic English; preserve meaning and flag missing context.'
      ),
      icon: Languages,
      iconClassName: 'bg-[#edf0f7] text-[#58668a]'
    }
  ]
  const themeReady = researchTheme.trim().length > 0
  const formatUpdated = (timestamp: number): string => {
    const { unit, count } = relativeTimeParts(timestamp)
    const time = unit === 'now' ? t('now') : t(COMPACT_ELAPSED[unit], { count, context: 'ago' })
    return t('Updated {{time}}', { time })
  }
  const hasMoreProjects = recentProjects.length > RECENT_PROJECT_PREVIEW_COUNT
  const visibleProjects =
    showAllProjects || !hasMoreProjects
      ? recentProjects
      : recentProjects.slice(0, RECENT_PROJECT_PREVIEW_COUNT)

  return (
    <section className="mt-8 space-y-4" aria-label={t('Medical research workflows')}>
      <div className="relative isolate overflow-hidden rounded-[26px] border border-[#ddd9cf] bg-[linear-gradient(120deg,#f8f7f1_0%,#f1f5f3_58%,#edf2f2_100%)] px-5 py-6 shadow-card sm:px-8 sm:py-7">
        <p
          data-testid="entry-step-1"
          className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#536970]"
        >
          <span>{t('Step 1')}</span>
          <span aria-hidden="true"> · </span>
          <span>{t('Project setup')}</span>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#536970]">
          <span>{t('Medical research workspace')}</span>
          <span className="size-1 rounded-full bg-[#bf5145]" aria-hidden="true" />
          <span className="tracking-[0.08em] text-[#9a5046]">{t('Research use only')}</span>
        </div>
        <h1 className="mt-3 max-w-[680px] font-serif text-[28px] font-medium leading-[1.18] tracking-[-0.025em] text-[#20343a] sm:text-[34px]">
          {t('Enter your research theme')}
        </h1>
        <p className="mt-2 max-w-[620px] text-sm leading-6 text-[#5a6b6c] sm:text-[15px]">
          {t('Describe the clinical question, then choose where to begin.')}
        </p>
        <div className="mt-5 max-w-3xl">
          <label
            htmlFor="medical-research-theme"
            className="mb-1.5 block text-xs font-semibold text-[#405c5f]"
          >
            {t('Research theme')}
          </label>
          <Textarea
            id="medical-research-theme"
            value={researchTheme}
            onChange={(event) => setResearchTheme(event.target.value)}
            placeholder={t('Type a clinical question or research topic…')}
            maxLength={2000}
            rows={2}
            className="min-h-[88px] resize-y rounded-xl border-[#d5dfdc] bg-white/80 px-3.5 py-3 text-sm leading-6 placeholder:text-[#829092] focus-visible:border-[#8ea9a7]"
          />
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs leading-5 text-[#687a7b]">
            <span className="shrink-0">{t('Try this example:')}</span>
            <button
              type="button"
              onClick={() => setResearchTheme(exampleTheme)}
              className="cursor-pointer text-left font-medium text-[#42686e] underline decoration-[#a9bcba] underline-offset-2 hover:text-[#244a50] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {exampleTheme}
            </button>
          </div>
        </div>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#d5dfdc] bg-white/65 px-3 py-1.5 text-xs font-medium text-[#405c5f]">
          {t('Local-first · Reviewable at every step')}
        </div>
        <p className="mt-2 max-w-3xl text-xs leading-5 text-[#687a7b]">
          {t(
            'Each project has its own Research Memory. With Memory on, DRA can recall confirmed study facts and decisions in later sessions; review them in Settings > Memory.'
          )}
        </p>
      </div>

      <section
        data-testid="entry-step-2"
        aria-label={t('Choose where to begin')}
        className="space-y-3"
      >
        <div className="px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#536970]">
            <span>{t('Step 2')}</span>
            <span aria-hidden="true"> · </span>
            <span>{t('Choose where to begin')}</span>
          </p>
          <h2 className="mt-1 text-[17px] font-medium leading-6 text-text-000">
            {t('Choose where to begin')}
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3" data-testid="home-primary-entries">
          {entries.map(
            ({
              id,
              workflow,
              title,
              subtitle,
              description,
              hardRule,
              inputNotice,
              icon: Icon,
              iconClassName
            }) => (
              <button
                key={id}
                type="button"
                data-testid={`home-entry-${id}`}
                data-home-entry={id}
                disabled={!themeReady}
                onClick={() => onSelectWorkflow(workflow, researchTheme.trim())}
                className="group flex min-h-[168px] cursor-pointer flex-col rounded-2xl border border-border-200/70 bg-bg-000 p-4 text-left shadow-card transition-colors hover:border-[#adc0bf] hover:bg-[#fcfcf9] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border-200/70 disabled:hover:bg-bg-000"
              >
                <span className="flex w-full items-start justify-between gap-3">
                  <span
                    className={cn(
                      'inline-flex size-9 items-center justify-center rounded-xl',
                      iconClassName
                    )}
                  >
                    <Icon className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <ArrowUpRight
                    className="mt-1 size-4 text-text-100 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#9c4d43]"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                </span>
                <span className="mt-3 text-sm font-semibold text-text-000">{title}</span>
                <span
                  data-testid={`home-entry-subtitle-${id}`}
                  className="mt-1 text-xs font-medium leading-[1.45] text-text-100"
                >
                  {subtitle}
                </span>
                <span className="mt-1 text-xs leading-[1.45] text-text-300">{description}</span>
                {hardRule ? (
                  <span
                    data-testid="mentor-pack-hard-rule"
                    className="mt-2 text-xs font-medium leading-[1.45] text-[#9a5046]"
                  >
                    {hardRule}
                  </span>
                ) : null}
                {inputNotice ? (
                  <span className="mt-1 text-xs leading-[1.45] text-[#9a5046]">{inputNotice}</span>
                ) : null}
              </button>
            )
          )}
        </div>
        <section
          data-testid="continue-project"
          aria-label={t('Continue a project')}
          className="w-full min-w-0 space-y-3"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="min-w-0 text-[17px] font-medium leading-6 text-text-000">
              {t('Continue a project')}
            </h2>
            {hasMoreProjects ? (
              <button
                type="button"
                data-testid="recent-projects-toggle"
                aria-expanded={showAllProjects}
                aria-controls="continue-project-grid"
                onClick={() => setShowAllProjects((open) => !open)}
                className="shrink-0 cursor-pointer rounded-md px-1 text-sm font-medium text-text-100 underline-offset-2 hover:text-text-000 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {showAllProjects ? t('Show fewer') : t('Show all projects')}
              </button>
            ) : null}
          </div>
          {visibleProjects.length === 0 ? (
            <p className="text-sm text-text-300">{t('No recent projects yet.')}</p>
          ) : (
            <TooltipProvider delayDuration={300}>
              <div
                id="continue-project-grid"
                data-testid="continue-project-grid"
                className="grid w-full grid-cols-1 items-stretch gap-3 sm:grid-cols-2"
              >
                {visibleProjects.map((project) => (
                  <Tooltip key={project.id}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        data-testid={`continue-project-${project.id}`}
                        onClick={() => onOpenProject(project.id)}
                        className={recentProjectCardClassName}
                      >
                        <span
                          data-testid={`continue-project-title-${project.id}`}
                          className="line-clamp-2 break-words text-sm font-medium leading-5 text-text-000 [overflow-wrap:anywhere]"
                        >
                          {project.name}
                        </span>
                        {project.updatedAt !== undefined && Number.isFinite(project.updatedAt) ? (
                          <span
                            data-testid={`continue-project-updated-${project.id}`}
                            className="mt-auto truncate pt-2 text-xs font-normal leading-4 text-text-300"
                          >
                            {formatUpdated(project.updatedAt)}
                          </span>
                        ) : null}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{project.name}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>
          )}
          <DeleteLocalCopiesButton
            canDelete={canDeleteLocalCopies}
            projectIds={localProjectIds}
            onDeleteLocalCopies={onDeleteLocalCopies}
          />
        </section>
        {deliveryLedger.lastCompletionId && !deliveryLedger.homeCardDismissed ? (
          <PackNextStepCard
            completionId={deliveryLedger.lastCompletionId}
            continueDisabled={!themeReady}
            onDismiss={dismissPackDeliveryHomeCard}
            onContinue={() => {
              const step = nextStepAfter(deliveryLedger.lastCompletionId!)
              if (!step || step.kind !== 'available' || !themeReady) return
              onSelectWorkflow(step.id, researchTheme.trim())
            }}
          />
        ) : null}
      </section>
      <SampleAbstractDialog open={sampleOpen} onClose={() => setSampleOpen(false)} />

      <div data-testid="home-secondary-actions" className="w-full min-w-0 space-y-1">
        <button
          type="button"
          data-testid="open-fictional-sample"
          onClick={() => setSampleOpen(true)}
          className="group flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-lg px-1 py-1.5 text-left hover:bg-bg-200 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <span className="text-sm font-medium text-text-100 underline-offset-2 group-hover:underline">
            {t('Fictional sample abstract')}
          </span>
          <span className="text-xs font-normal leading-5 text-text-300">
            {t('Open the fictional sample. No model call and no API key.')}
          </span>
        </button>
        <button
          type="button"
          data-testid="start-from-step"
          aria-expanded={stepsOpen}
          aria-controls="research-step-entries"
          onClick={() => setStepsOpen((open) => !open)}
          className="flex w-full cursor-pointer items-center gap-1.5 rounded-lg px-1 py-1.5 text-left text-sm font-medium text-text-100 hover:bg-bg-200 hover:text-text-000 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-text-300 transition-transform',
              stepsOpen && 'rotate-180'
            )}
            strokeWidth={1.8}
            aria-hidden="true"
          />
          <span className="min-w-0">
            {t('Start from a step (literature, planning, analysis, and more)')}
          </span>
        </button>
      </div>

      {stepsOpen ? (
        <div id="research-step-entries" data-testid="research-step-entries" className="space-y-3">
          <div className="flex items-end justify-between gap-3 px-1">
            <div>
              <h2 className="text-[17px] font-medium leading-6 text-text-000">
                {t('Choose where to begin')}
              </h2>
              <p className="mt-0.5 text-xs text-text-300">
                {t('Each stage pauses for researcher confirmation before the workflow continues.')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {workflows.map(({ id, title, description, icon: Icon, iconClassName }) => (
              <button
                key={id}
                type="button"
                data-testid={`research-entry-${id}`}
                disabled={!themeReady}
                onClick={() => onSelectWorkflow(id, researchTheme.trim())}
                className="group flex min-h-[136px] cursor-pointer flex-col rounded-2xl border border-border-200/70 bg-bg-000 p-4 text-left shadow-card transition-colors hover:border-[#adc0bf] hover:bg-[#fcfcf9] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border-200/70 disabled:hover:bg-bg-000"
              >
                <span className="flex w-full items-start justify-between gap-3">
                  <span
                    className={cn(
                      'inline-flex size-9 items-center justify-center rounded-xl',
                      iconClassName
                    )}
                  >
                    <Icon className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <ArrowUpRight
                    className="mt-1 size-4 text-text-100 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#9c4d43]"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                </span>
                <span className="mt-3 text-sm font-semibold text-text-000">{title}</span>
                <span className="mt-1 text-xs leading-[1.45] text-text-300">{description}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div
        data-testid="research-use-disclaimer"
        className="flex items-start gap-2.5 rounded-xl border border-border-200/70 bg-bg-200 px-3.5 py-3 text-xs leading-5 text-text-100"
      >
        <ShieldCheck
          className="mt-0.5 size-4 shrink-0 text-text-300"
          strokeWidth={1.8}
          aria-hidden="true"
        />
        <p>
          {t(
            'For academic research only; not for diagnosis or treatment. Use fictional data only. Do not upload identifiable patient information. Researchers must verify sources, methods, and outputs.'
          )}
        </p>
      </div>
    </section>
  )
}

export { MedicalResearchLaunchpad }
