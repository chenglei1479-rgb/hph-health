import { useTranslation } from 'react-i18next'

import {
  SHOW_UNRELEASED_PACK_PLACEHOLDERS,
  nextStepAfter,
  type DeliveryPackId
} from '../../../../shared/deliverable-next-step'
import { deliveryPackTitle, unreleasedDestinationTitle } from './delivery-pack-title'

type PackNextStepCardProps = {
  completionId: DeliveryPackId
  showUnreleasedPlaceholders?: boolean
  continueDisabled?: boolean
  onContinue?: () => void
  onDismiss?: () => void
}

export const PackNextStepCard = ({
  completionId,
  showUnreleasedPlaceholders = SHOW_UNRELEASED_PACK_PLACEHOLDERS,
  continueDisabled = false,
  onContinue,
  onDismiss
}: PackNextStepCardProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const step = nextStepAfter(completionId, { showUnreleasedPlaceholders })
  if (!step) return null
  const title =
    step.kind === 'available'
      ? deliveryPackTitle(t, step.id)
      : unreleasedDestinationTitle(t, step.id)
  return (
    <section
      data-testid="pack-next-step"
      data-next-step={step.id}
      data-next-step-kind={step.kind}
      aria-label={t('Next step')}
      className="rounded-2xl border border-[#e4ded2] bg-[#faf8f2] px-4 py-3 text-sm text-[#20343a]"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#536970]">
          {t('Next step')}
        </h2>
        {onDismiss ? (
          <button type="button" className="text-xs text-[#536970]" onClick={onDismiss}>
            {t('Dismiss')}
          </button>
        ) : null}
      </div>
      <p className="mt-2 font-medium">{title}</p>
      {step.kind === 'unreleased' ? (
        <p className="mt-1 text-xs leading-5 text-[#635f56]">
          <span className="font-medium">{t('Not available in this version')}</span>
          <span> </span>
          <span>{t('This destination is not in the app yet.')}</span>
        </p>
      ) : (
        <button
          type="button"
          data-testid="pack-next-step-open"
          className="mt-3 rounded-xl border border-[#d5dfdc] bg-white px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          disabled={continueDisabled}
          onClick={onContinue}
        >
          {t('Open this step')}
        </button>
      )}
    </section>
  )
}
