import { ClipboardCheck, ShieldCheck, UserRoundCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const JapanResearchGuide = (): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <aside
      aria-labelledby="japan-research-guide-title"
      className="mt-6 rounded-xl border border-[#e4ded2] bg-[#faf8f2] p-3.5"
    >
      <div className="flex items-center gap-2 text-[#8c5148]">
        <ClipboardCheck className="size-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
        <h2
          id="japan-research-guide-title"
          className="text-xs font-semibold leading-5 text-text-000"
        >
          {t('Before your first Japan-related study')}
        </h2>
      </div>
      <ul className="mt-3 space-y-2.5 text-[11px] leading-[1.5] text-text-200">
        <li className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[#8c8270]" aria-hidden="true" />
          <span>
            {t(
              "Check your institution's current requirements for ethics review and study registration."
            )}
          </span>
        </li>
        <li className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[#8c8270]" aria-hidden="true" />
          <span>{t('Remove direct identifiers before uploading clinical data.')}</span>
        </li>
        <li className="flex items-start gap-2">
          <UserRoundCheck className="mt-0.5 size-3.5 shrink-0 text-[#8c8270]" aria-hidden="true" />
          <span>{t('Verify references, methods, and results yourself.')}</span>
        </li>
      </ul>
    </aside>
  )
}

export { JapanResearchGuide }
