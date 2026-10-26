import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  confirmPrereleaseModelCallNotice,
  prereleaseModelCallNoticePending,
  subscribePrereleaseModelCallNotice
} from '@/lib/prerelease-model-call-notice'
import {
  PRERELEASE_DATA_DESTINATION_NOTICE,
  PRERELEASE_DATA_USE_NOTICE
} from '../../../shared/prerelease'

const Dialog = ({ onContinue }: { onContinue: () => void }): React.JSX.Element => {
  const { t } = useTranslation()
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="prerelease-first-model-call-notice"
        data-testid="prerelease-first-model-call"
        className="max-w-md rounded-xl border border-status-warning-foreground/30 bg-status-warning-surface px-4 py-3 text-sm text-status-warning-foreground shadow-lg dark:border-status-warning-dark-foreground/30 dark:bg-status-warning-dark-surface dark:text-status-warning-dark-foreground"
        onKeyDown={(event) => {
          if (event.key === 'Escape') event.preventDefault()
        }}
      >
        <p id="prerelease-first-model-call-notice">{t(PRERELEASE_DATA_DESTINATION_NOTICE)}</p>
        <p className="mt-2">{t(PRERELEASE_DATA_USE_NOTICE)}</p>
        <Button type="button" className="mt-3" autoFocus onClick={onContinue}>
          {t('Continue')}
        </Button>
      </div>
    </div>
  )
}

// Blocks the first model call until the fictional-data sentence has been acknowledged.
export const PrereleaseFirstModelCallNotice = (): React.JSX.Element | null => {
  const [open, setOpen] = useState(prereleaseModelCallNoticePending)
  useEffect(
    () =>
      subscribePrereleaseModelCallNotice(() => {
        setOpen(true)
      }),
    []
  )
  if (!open) return null
  return (
    <Dialog
      onContinue={() => {
        setOpen(false)
        confirmPrereleaseModelCallNotice()
      }}
    />
  )
}
