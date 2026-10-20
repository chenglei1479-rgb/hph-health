import { useTranslation } from 'react-i18next'

import { AppBrand } from '@/components/AppBrand'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { BETA_TERMS_COPY } from '../../../../shared/beta-terms'
import { BetaTermsConsent, BetaTermsContent } from './BetaTerms'

type BetaTermsGateProps = {
  // The gate is rendered only while the current version is unacknowledged. Accepting updates the
  // settings snapshot, which moves startup to the app without ever mutating onboardingCompletedAt.
  onAccepted: () => void
}

// Lightweight startup gate for completed installs that have no record of the current terms (older
// users or a version bump). It intentionally does not mount the onboarding wizard or its checks.
const BetaTermsGate = ({ onAccepted }: BetaTermsGateProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <main className="h-svh overflow-y-auto bg-bg-10 text-text-000">
      <div className="mx-auto flex min-h-full w-full max-w-[860px] flex-col px-4 py-6 sm:px-8 sm:py-10">
        <div className="font-serif text-[26px] font-medium leading-none tracking-[-0.02em] text-text-000">
          <AppBrand />
        </div>
        <Card className="mt-8 gap-0 rounded-lg bg-bg-000 py-0 shadow-card ring-1 ring-border-200">
          <CardHeader className="gap-2 px-6 py-6">
            <p className="text-[11px] font-medium text-muted-foreground">{t('Beta program')}</p>
            <h1 className="text-xl font-semibold leading-7 text-text-000">
              {t(BETA_TERMS_COPY.title)}
            </h1>
            <CardDescription className="text-sm leading-6">
              {t('Please review and accept the terms before using this build.')}
            </CardDescription>
          </CardHeader>
          <Separator className="bg-border-200" />
          <CardContent className="px-6 py-5">
            <div className="max-h-[46vh] overflow-y-auto pr-1" tabIndex={0}>
              <BetaTermsContent />
            </div>
            <BetaTermsConsent className="mt-6" onAccepted={onAccepted} />
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

export { BetaTermsGate }
