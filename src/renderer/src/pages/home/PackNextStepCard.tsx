import { useTranslation } from 'react-i18next'

import {
  SHOW_UNRELEASED_PACK_PLACEHOLDERS,
  nextStepAfter,
  type DeliveryPackId
} from '../../../../shared/deliverable-next-step'
import { deliveryPackTitle, unreleasedDestinationTitle } from './delivery-pack-title'
import {
  homeBodyClassName,
  homeCardClassName,
  homeMutedClassName,
  homeTitleClassName
} from './home-layout'
import { cn } from '@/lib/utils'

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
      className={cn(homeCardClassName, 'flex flex-col gap-2 p-4')}
    >
      <div className="flex items-start justify-between gap-4">
        <h2 className={homeTitleClassName}>{t('Next step')}</h2>
        {onDismiss ? (
          <button type="button" className={homeMutedClassName} onClick={onDismiss}>
            {t('Dismiss')}
          </button>
        ) : null}
      </div>
      <p className={homeBodyClassName}>{title}</p>
      {step.kind === 'unreleased' ? (
        <p className={homeMutedClassName}>
          <span>{t('Not available in this version')}</span>
          <span> </span>
          <span>{t('This destination is not in the app yet.')}</span>
        </p>
      ) : (
        <button
          type="button"
          data-testid="pack-next-step-open"
          className="h-9 w-fit rounded-lg border border-border-200 bg-bg-000 px-3 text-sm font-medium leading-5 text-text-000 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={continueDisabled}
          onClick={onContinue}
        >
          {t('Open this step')}
        </button>
      )}
    </section>
  )
}
