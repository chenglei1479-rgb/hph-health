import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import * as Dialog from '@/components/ui/dialog'
import {
  dialogBodyClassName,
  dialogCloseButtonClassName,
  dialogDescriptionClassName,
  dialogFooterClassName,
  dialogHeaderClassName,
  dialogOverlayClassName,
  dialogPanelClassName,
  dialogTitleClassName
} from '@/components/ui/dialog-chrome'
import { BETA_TERMS_COPY, BETA_TERMS_VERSION } from '../../../../shared/beta-terms'
import { useSettingsStore } from '@/stores/settings-store'
import { onboardingErrorMessage } from './onboarding-error'

type BetaTermsContentProps = {
  className?: string
}

// The terms themselves, shared by the onboarding step and the standalone startup gate. Each section
// is a separate paragraph so the copy can be read (and translated) without a single wall of text.
const BetaTermsContent = ({ className }: BetaTermsContentProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className={className} data-testid="beta-terms-content">
      <p className="text-sm leading-6 text-text-100">{t(BETA_TERMS_COPY.intro)}</p>
      <div className="mt-4 space-y-4">
        {BETA_TERMS_COPY.sections.map((section) => (
          <section key={section.title}>
            <h3 className="text-sm font-semibold text-text-000">{t(section.title)}</h3>
            <p className="mt-1 text-sm leading-6 text-text-100">{t(section.body)}</p>
          </section>
        ))}
      </div>
    </div>
  )
}

type BetaTermsConsentProps = {
  onAccepted: () => void
  // The onboarding card supplies its own footer; the standalone gate uses the default action row.
  showActions?: boolean
  className?: string
}

// Checkbox + agreement action. Nothing is pre-checked: the user must actively opt in, and the action
// stays disabled (with an aria explanation) until they do. Acceptance is written through the settings
// repository only; no network call or telemetry accompanies it.
const BetaTermsConsent = ({
  onAccepted,
  showActions = true,
  className
}: BetaTermsConsentProps): React.JSX.Element => {
  const { t } = useTranslation()
  const acceptBetaTerms = useSettingsStore((state) => state.acceptBetaTerms)
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [printOpen, setPrintOpen] = useState(false)
  const hintId = useId()
  const checkboxId = useId()

  const handleAccept = async (): Promise<void> => {
    if (!checked || busy) return
    setBusy(true)
    setError(undefined)
    try {
      await acceptBetaTerms()
      onAccepted()
    } catch (caught) {
      setError(
        onboardingErrorMessage(caught, t('Could not save your agreement. Please try again.'))
      )
    } finally {
      setBusy(false)
    }
  }

  const handleSaveCopy = async (): Promise<void> => {
    const body = [
      t(BETA_TERMS_COPY.title),
      `β ${BETA_TERMS_VERSION}`,
      '',
      t(BETA_TERMS_COPY.intro),
      '',
      ...BETA_TERMS_COPY.sections.flatMap((section) => [t(section.title), t(section.body), ''])
    ].join('\n')
    const bytes = new TextEncoder().encode(body)
    await window.api.saveBlobFile({
      suggestedName: `Baselio-beta-terms-${BETA_TERMS_VERSION}.txt`,
      mimeType: 'text/plain',
      data: bytes.buffer as ArrayBuffer
    })
  }

  return (
    <div className={className} data-testid="beta-terms-consent">
      <div className="flex items-start gap-3">
        <input
          id={checkboxId}
          type="checkbox"
          checked={checked}
          onChange={(event) => setChecked(event.currentTarget.checked)}
          disabled={busy}
          aria-describedby={checked ? undefined : hintId}
          className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary"
        />
        <label htmlFor={checkboxId} className="cursor-pointer text-sm leading-5 text-text-000">
          {t(BETA_TERMS_COPY.acknowledgement)}
        </label>
      </div>
      <p id={hintId} className="mt-2 text-xs leading-5 text-muted-foreground" aria-live="polite">
        {checked ? '' : t(BETA_TERMS_COPY.requiredHint)}
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {showActions ? (
          <Button
            type="button"
            onClick={() => void handleAccept()}
            disabled={!checked || busy}
            aria-describedby={checked ? undefined : hintId}
            aria-busy={busy}
            className="px-4"
          >
            {t(BETA_TERMS_COPY.agreeAndContinue)}
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={() => setPrintOpen(true)}>
          {t(BETA_TERMS_COPY.openPrintable)}
        </Button>
      </div>

      {/* The printable copy is a plain local document. Closing this dialog never grants access. */}
      <Dialog.Root open={printOpen} onOpenChange={setPrintOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className={dialogOverlayClassName} />
          <Dialog.Content
            className={dialogPanelClassName('max-h-[85vh] w-[min(720px,calc(100vw-2rem))] p-0')}
          >
            <div className={dialogHeaderClassName}>
              <Dialog.Title className={dialogTitleClassName}>
                {t(BETA_TERMS_COPY.title)}
              </Dialog.Title>
              <Dialog.Description className={dialogDescriptionClassName}>
                {BETA_TERMS_VERSION}
              </Dialog.Description>
            </div>
            <div className={`${dialogBodyClassName} max-h-[55vh] overflow-y-auto`}>
              <BetaTermsContent />
            </div>
            <div className={dialogFooterClassName}>
              <Button type="button" variant="outline" onClick={() => void handleSaveCopy()}>
                {t(BETA_TERMS_COPY.save)}
              </Button>
              <Button type="button" onClick={() => window.print()}>
                {t(BETA_TERMS_COPY.print)}
              </Button>
              <Dialog.Close asChild>
                <Button type="button" variant="ghost" className={dialogCloseButtonClassName}>
                  {t(BETA_TERMS_COPY.close)}
                </Button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

export { BetaTermsConsent, BetaTermsContent }
