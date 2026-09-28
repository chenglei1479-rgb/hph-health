import {
  ArrowUpRight,
  BookOpenCheck,
  ChartNoAxesCombined,
  ClipboardCheck,
  FilePenLine,
  ShieldCheck,
  type LucideIcon
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

export type MedicalResearchWorkflow = 'evidence' | 'protocol' | 'analysis' | 'manuscript'

type WorkflowCard = {
  id: MedicalResearchWorkflow
  title: string
  description: string
  icon: LucideIcon
  iconClassName: string
}

type MedicalResearchLaunchpadProps = {
  onSelectWorkflow: (workflow: MedicalResearchWorkflow) => void
}

const MedicalResearchLaunchpad = ({
  onSelectWorkflow
}: MedicalResearchLaunchpadProps): React.JSX.Element => {
  const { t } = useTranslation()
  const workflows: WorkflowCard[] = [
    {
      id: 'evidence',
      title: t('Evidence synthesis'),
      description: t('Frame a PICO question and build a traceable evidence table.'),
      icon: BookOpenCheck,
      iconClassName: 'bg-[#eef3f4] text-[#315b67]'
    },
    {
      id: 'protocol',
      title: t('Study protocol'),
      description: t('Turn a research question into an editable study protocol.'),
      icon: ClipboardCheck,
      iconClassName: 'bg-[#f5eee7] text-[#965749]'
    },
    {
      id: 'analysis',
      title: t('Statistical analysis'),
      description: t('Plan a reproducible analysis and preserve the raw data.'),
      icon: ChartNoAxesCombined,
      iconClassName: 'bg-[#eef2e9] text-[#58744b]'
    },
    {
      id: 'manuscript',
      title: t('Manuscript drafting'),
      description: t('Draft from verified sources and real study results.'),
      icon: FilePenLine,
      iconClassName: 'bg-[#f3edf1] text-[#78576e]'
    }
  ]

  return (
    <section className="mt-8 space-y-4" aria-label={t('Medical research workflows')}>
      <div className="relative isolate overflow-hidden rounded-[26px] border border-[#ddd9cf] bg-[linear-gradient(120deg,#f8f7f1_0%,#f1f5f3_58%,#edf2f2_100%)] px-5 py-6 shadow-card sm:px-8 sm:py-7">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -top-16 -z-10 hidden size-64 rounded-full border border-[#bf5145]/15 sm:block"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-7 top-5 -z-10 hidden size-44 rounded-full border border-[#bf5145]/15 sm:block"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-[78px] top-[42px] -z-10 hidden size-20 items-center justify-center rounded-full border border-[#bd4c40]/25 bg-[#fbf7f0] font-serif text-4xl font-light text-[#bd4c40] sm:flex"
        >
          日
        </div>
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 right-0 -z-10 hidden h-24 w-72 text-[#6c8990]/20 sm:block"
          viewBox="0 0 288 96"
          fill="none"
        >
          <path d="M0 72C36 48 72 48 108 72s72 24 108 0 54-24 72-12" stroke="currentColor" />
          <path d="M0 84c36-24 72-24 108 0s72 24 108 0 54-24 72-12" stroke="currentColor" />
          <path d="M0 60c36-24 72-24 108 0s72 24 108 0 54-24 72-12" stroke="currentColor" />
        </svg>

        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#536970]">
          <span>{t('Medical research workspace')}</span>
          <span className="size-1 rounded-full bg-[#bf5145]" aria-hidden="true" />
          <span className="tracking-[0.08em] text-[#9a5046]">{t('Research use only')}</span>
        </div>
        <h1 className="mt-3 max-w-[680px] font-serif text-[28px] font-medium leading-[1.18] tracking-[-0.025em] text-[#20343a] sm:text-[34px]">
          {t('From clinical question to traceable evidence.')}
        </h1>
        <p className="mt-2 max-w-[620px] text-sm leading-6 text-[#5a6b6c] sm:text-[15px]">
          {t('A focused workspace for medical literature, study design, analysis, and writing.')}
        </p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#d5dfdc] bg-white/65 px-3 py-1.5 text-xs font-medium text-[#405c5f]">
          <span aria-hidden="true" className="font-serif text-sm text-[#bd4c40]">
            波
          </span>
          {t('Local-first · Chinese and Japanese · Reviewable at every step')}
        </div>
      </div>

      <div className="flex items-end justify-between gap-3 px-1">
        <div>
          <h2 className="text-[17px] font-medium leading-6 text-text-000">
            {t('Choose a research workflow')}
          </h2>
          <p className="mt-0.5 text-xs text-text-300">{t('Start with a structured, editable task draft.')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {workflows.map(({ id, title, description, icon: Icon, iconClassName }) => (
          <button
            key={id}
            type="button"
            onClick={() => onSelectWorkflow(id)}
            className="group flex min-h-[136px] cursor-pointer flex-col rounded-2xl border border-border-200/70 bg-bg-000 p-4 text-left shadow-card transition-colors hover:border-[#adc0bf] hover:bg-[#fcfcf9] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span className="flex w-full items-start justify-between gap-3">
              <span className={cn('inline-flex size-9 items-center justify-center rounded-xl', iconClassName)}>
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

      <div className="flex items-start gap-2.5 rounded-xl border border-[#e4ded2] bg-[#faf8f2] px-3.5 py-3 text-xs leading-5 text-[#635f56]">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#7d8066]" strokeWidth={1.8} aria-hidden="true" />
        <p>{t('For academic research only; not for diagnosis or treatment. Do not upload identifiable patient information. Researchers must verify sources, methods, and outputs.')}</p>
      </div>
    </section>
  )
}

export { MedicalResearchLaunchpad }
