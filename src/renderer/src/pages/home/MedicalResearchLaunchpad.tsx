import {
  ArrowUpRight,
  BookOpenCheck,
  ChartNoAxesCombined,
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
import { Textarea } from '@/components/ui/textarea'

export type MedicalResearchWorkflow =
  'novelty' | 'evidence' | 'protocol' | 'analysis' | 'manuscript' | 'academic-english'

type WorkflowCard = {
  id: MedicalResearchWorkflow
  title: string
  description: string
  icon: LucideIcon
  iconClassName: string
}

type MedicalResearchLaunchpadProps = {
  onSelectWorkflow: (workflow: MedicalResearchWorkflow, theme: string) => void
}

const MedicalResearchLaunchpad = ({
  onSelectWorkflow
}: MedicalResearchLaunchpadProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [researchTheme, setResearchTheme] = useState('')
  const exampleTheme = t(
    'I want to study the treatment effect of immune checkpoint inhibitors in patients with lung cancer.'
  )
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
      description: t('Turn a research question into an editable study protocol.'),
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
        'Turn Japanese research notes into section-aware academic English; preserve meaning and flag missing context.'
      ),
      icon: Languages,
      iconClassName: 'bg-[#edf0f7] text-[#58668a]'
    }
  ]

  return (
    <section className="mt-8 space-y-4" aria-label={t('Medical research workflows')}>
      <div className="relative isolate overflow-hidden rounded-[26px] border border-[#ddd9cf] bg-[linear-gradient(120deg,#f8f7f1_0%,#f1f5f3_58%,#edf2f2_100%)] px-5 py-6 shadow-card sm:px-8 sm:py-7">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#536970]">
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
            disabled={!researchTheme.trim()}
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

      <div className="flex items-start gap-2.5 rounded-xl border border-[#e4ded2] bg-[#faf8f2] px-3.5 py-3 text-xs leading-5 text-[#635f56]">
        <ShieldCheck
          className="mt-0.5 size-4 shrink-0 text-[#7d8066]"
          strokeWidth={1.8}
          aria-hidden="true"
        />
        <p>
          {t(
            'For academic research only; not for diagnosis or treatment. Do not upload identifiable patient information. Researchers must verify sources, methods, and outputs.'
          )}
        </p>
      </div>
    </section>
  )
}

export { MedicalResearchLaunchpad }
