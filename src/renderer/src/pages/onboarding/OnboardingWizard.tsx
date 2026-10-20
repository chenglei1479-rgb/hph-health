import { AppBrand } from '@/components/AppBrand'
import { Check } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { APP } from '../../../../shared/app-config'
import { hasCurrentBetaTermsAcceptance } from '../../../../shared/beta-terms'
import type { StorageInfo } from '../../../../shared/storage'
import { useSettingsStore } from '@/stores/settings-store'
import {
  createEmptyProviderFormValue,
  type ProviderFormValue
} from '../settings/provider-form-value'
import { AgentBootstrapStep } from './AgentBootstrapStep'
import { BetaTermsConsent, BetaTermsContent } from './BetaTerms'
import { EnvironmentStep } from './EnvironmentStep'
import { JapanResearchGuide } from './JapanResearchGuide'
import { LocationStep, type LocationDraft } from './LocationStep'
import { onboardingErrorMessage } from './onboarding-error'
import { ProviderStep } from './ProviderStep'

type WizardStep = 'terms' | 'environment' | 'location' | 'agent' | 'provider'
type OnboardingWizardProps = {
  loadStorageInfo?: () => Promise<StorageInfo>
}

// The beta flow keeps five named stages visible. Environment is skipped when its preflight passes,
// the Codex runtime stage installs in the background (or verifies an existing runtime), and Notebook
// is bundled and no longer a setup stage — so a healthy fresh install only asks for the terms, the
// data location, and the provider (which can be deferred). The catalog still keeps the
// 'Notebook runtime' key for the Notebook surface and the runtime-glossary guard.
const STEP_ORDER: WizardStep[] = ['terms', 'environment', 'location', 'agent', 'provider']

// The step id is a runtime value, so it can't be interpolated into a natural-language key.
const STEP_LABELS = {
  terms: 'Beta terms of use',
  environment: 'Environment',
  location: 'Data location',
  agent: 'Agent runtime',
  provider: 'Model provider'
}

const loadStorageInfoFromBridge = (): Promise<StorageInfo> => window.api.storage.getInfo()

// Keeps the five-step sequence visible without turning the lightweight setup flow into navigation.
const OnboardingProgress = ({ step }: { step: WizardStep }): React.JSX.Element => {
  const { t } = useTranslation()
  const currentIndex = STEP_ORDER.indexOf(step)

  return (
    <ol aria-label={t('Setup progress')} className="mt-7 space-y-3">
      {STEP_ORDER.map((wizardStep, index) => {
        const state = index < currentIndex ? 'done' : index === currentIndex ? 'active' : 'upcoming'

        return (
          <li
            key={wizardStep}
            aria-current={state === 'active' ? 'step' : undefined}
            className={cn(
              'flex items-center gap-2 text-sm',
              state === 'active' ? 'font-medium text-text-000' : 'text-muted-foreground'
            )}
          >
            <span
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full text-[11px]',
                state === 'active'
                  ? 'bg-primary font-medium text-primary-foreground'
                  : state === 'done'
                    ? 'border border-primary/40 text-primary'
                    : 'border border-border-300 bg-bg-000'
              )}
              aria-hidden="true"
            >
              {state === 'done' ? <Check className="size-3" strokeWidth={2.4} /> : index + 1}
            </span>
            <span>{t(STEP_LABELS[wizardStep])}</span>
          </li>
        )
      })}
    </ol>
  )
}

// First-run gate: accept the beta terms, confirm the data location, install Codex CLI in the
// background, then optionally connect a model. Host and notebook checks are silent unless they fail.
const OnboardingWizard = ({
  loadStorageInfo = loadStorageInfoFromBridge
}: OnboardingWizardProps): React.JSX.Element => {
  const { t } = useTranslation()
  const environmentCheck = useSettingsStore((state) => state.environmentCheck)
  const environmentCheckError = useSettingsStore((state) => state.environmentCheckError)
  const isCheckingEnvironment = useSettingsStore((state) => state.isCheckingEnvironment)
  const checkEnvironment = useSettingsStore((state) => state.checkEnvironment)
  const agentFrameworkId = useSettingsStore((state) => state.agentFrameworkId)
  const betaTermsAcceptance = useSettingsStore((state) => state.betaTermsAcceptance)
  const completeOnboarding = useSettingsStore((state) => state.completeOnboarding)

  const [step, setStep] = useState<WizardStep>(() =>
    hasCurrentBetaTermsAcceptance(betaTermsAcceptance) ? 'environment' : 'terms'
  )
  const stepCard = useRef<HTMLDivElement>(null)
  const previousStep = useRef(step)
  useEffect(() => {
    if (previousStep.current === step) return
    previousStep.current = step
    // Settings-backed steps already own an h2. Keep focus scoped to the wizard and only move it
    // when the step changes, never when async checks or form inputs update.
    const heading = stepCard.current?.querySelector('h2')
    if (heading) {
      heading.tabIndex = -1
      heading.focus()
    }
  }, [step])

  // The provider draft lives here (not in ProviderStep) so going Back and returning keeps it.
  const [providerDraft, setProviderDraft] = useState<{
    value: ProviderFormValue
    providerId?: string
    generation: number
  }>(() => ({ value: createEmptyProviderFormValue(), generation: 0 }))
  const setFormValue = useCallback<React.Dispatch<React.SetStateAction<ProviderFormValue>>>(
    (update) => {
      setProviderDraft((current) => {
        const value = typeof update === 'function' ? update(current.value) : update
        if (value === current.value) return current
        const changedKind =
          value.type !== current.value.type || value.vendorId !== current.value.vendorId
        return changedKind ? { value, generation: current.generation + 1 } : { ...current, value }
      })
    },
    []
  )
  const recordSavedProvider = (providerId: string | undefined): void => {
    // A response for an abandoned provider kind cannot attach its identity to the new draft.
    setProviderDraft((current) =>
      current.generation === providerDraft.generation ? { ...current, providerId } : current
    )
  }

  // Fetched once, up front, so Location has the default to show and a post-selection relaunch can
  // resume after the already-completed location step.
  const [dataRootInfo, setDataRootInfo] = useState<StorageInfo | null>(null)
  const [dataRootError, setDataRootError] = useState<string | undefined>(undefined)
  const [locationDraft, setLocationDraft] = useState<LocationDraft>({
    chosenDataRoot: '',
    chosenKind: null
  })
  const [relaunchError, setRelaunchError] = useState<string | undefined>(undefined)
  const [isRelaunching, setIsRelaunching] = useState(false)
  const [completionError, setCompletionError] = useState<string | undefined>(undefined)
  const completionInFlight = useRef(false)
  const didResumeStorage = useRef(false)
  const didRequestCheck = useRef(false)

  // The packaged launch smoke treats the first-run wizard as a started surface; the gate still
  // requires explicit consent before Home.
  useEffect(() => {
    document.documentElement.dataset.draOnboardingReady = '1'
    return () => {
      delete document.documentElement.dataset.draOnboardingReady
    }
  }, [])

  const hostReady =
    !isCheckingEnvironment &&
    environmentCheck !== undefined &&
    environmentCheck.agentFrameworkId === agentFrameworkId &&
    environmentCheck.checks.every(
      (check) => check.id === 'agent' || check.id === 'python' || check.status !== 'failed'
    )

  // Environment is visible only while it is unresolved or failing; a passing preflight silently
  // moves on to the location step.
  useEffect(() => {
    if (step === 'environment' && hostReady) {
      queueMicrotask(() => setStep('location'))
    }
  }, [hostReady, step])

  const handleTermsAccepted = useCallback((): void => {
    setStep(hostReady ? 'location' : 'environment')
  }, [hostReady])

  // App starts this check on every launch. This local fallback also keeps the wizard self-contained in
  // tests or alternate entry surfaces where it may be mounted without App as its parent.
  useEffect(() => {
    if (
      !environmentCheck &&
      !environmentCheckError &&
      !isCheckingEnvironment &&
      !didRequestCheck.current
    ) {
      didRequestCheck.current = true
      void checkEnvironment()
    }
  }, [environmentCheck, environmentCheckError, isCheckingEnvironment, checkEnvironment])

  const handleDataRootInfoSuccess = useCallback((info: StorageInfo): void => {
    setDataRootInfo(info)
    setDataRootError(undefined)
    // A persisted custom root is the durable resume signal after Location relaunched the app. Terms
    // are still authoritative: never skip an unaccepted gate.
    if (!didResumeStorage.current) {
      didResumeStorage.current = true
      if (
        !info.isDefault &&
        !info.dataRootMissing &&
        hasCurrentBetaTermsAcceptance(useSettingsStore.getState().betaTermsAcceptance)
      ) {
        setStep('agent')
      }
    }
  }, [])
  const handleDataRootInfoFailure = useCallback((error: unknown): void => {
    setDataRootError(
      onboardingErrorMessage(error, 'Could not load the default data location. Please try again.')
    )
  }, [])
  const retryDataRootInfo = useCallback((): void => {
    setDataRootError(undefined)
    void loadStorageInfo().then(handleDataRootInfoSuccess, handleDataRootInfoFailure)
  }, [handleDataRootInfoFailure, handleDataRootInfoSuccess, loadStorageInfo])

  useEffect(() => {
    void loadStorageInfo().then(handleDataRootInfoSuccess, handleDataRootInfoFailure)
  }, [handleDataRootInfoFailure, handleDataRootInfoSuccess, loadStorageInfo])

  const finishOnboarding = useCallback(async (): Promise<void> => {
    if (completionInFlight.current) return
    completionInFlight.current = true
    setCompletionError(undefined)
    try {
      await completeOnboarding()
    } catch (error) {
      setCompletionError(onboardingErrorMessage(error, t('Could not finish setup.')))
      completionInFlight.current = false
    }
  }, [completeOnboarding, t])

  if (isRelaunching) {
    return (
      <main className="flex h-svh items-center justify-center bg-bg-10 text-text-000">
        <p className="text-sm text-text-100">{t('Setting up your workspace…')}</p>
      </main>
    )
  }

  return (
    <main className="h-svh overflow-y-auto bg-bg-10 text-text-000">
      <div className="mx-auto min-h-full w-full max-w-[1040px] px-4 py-5 sm:px-8 sm:py-7">
        <a
          href={APP.links.website}
          target="_blank"
          rel="noreferrer"
          className="font-serif text-[26px] font-medium leading-none tracking-[-0.02em] text-text-000 transition-colors duration-150 ease-out hover:text-text-100"
        >
          <AppBrand />
        </a>

        <div
          data-onboarding-layout="split"
          className="mt-8 grid grid-cols-1 gap-6 md:mt-12 md:grid-cols-[240px_minmax(0,1fr)] md:gap-10"
        >
          <section aria-labelledby="onboarding-introduction-title" className="md:pt-2">
            <p className="text-[11px] font-medium text-muted-foreground">{t('FIRST-TIME SETUP')}</p>
            <h1
              id="onboarding-introduction-title"
              className="mt-2 font-serif text-[28px] leading-[1.15] font-medium text-text-000"
            >
              {t('Set up your research workspace.')}
            </h1>
            <p className="mt-3 max-w-60 text-sm leading-5 text-muted-foreground">
              {t(
                'Review the beta terms, confirm where your data lives, and connect a model when you are ready.'
              )}
            </p>
            <OnboardingProgress step={step} />
            <JapanResearchGuide />
          </section>

          {/* One stable work surface keeps the setup steps aligned as their content changes. */}
          <Card
            ref={stepCard}
            className="min-h-[420px] gap-0 rounded-lg bg-bg-000 py-0 shadow-card ring-1 ring-border-200"
          >
            {/* Each step owns its validation gate and advances only through its callback. The shell
                owns cross-step drafts so Back/Continue never discards provider or location input. */}
            {step === 'terms' ? (
              <>
                <CardHeader className="gap-1 rounded-t-lg px-4 py-5 sm:px-6">
                  <h2 tabIndex={-1} className="text-[15px] font-semibold">
                    {t('Beta terms of use')}
                  </h2>
                  <CardDescription className="text-xs leading-5">
                    {t('Please review and accept the terms before using this build.')}
                  </CardDescription>
                </CardHeader>
                <Separator className="bg-border-200" />
                <CardContent className="flex-1 px-4 py-5 sm:px-6">
                  <div className="max-h-[42vh] overflow-y-auto pr-1" tabIndex={0}>
                    <BetaTermsContent />
                  </div>
                  <BetaTermsConsent className="mt-5" onAccepted={handleTermsAccepted} />
                </CardContent>
              </>
            ) : step === 'environment' ? (
              <EnvironmentStep onContinue={() => setStep('location')} />
            ) : step === 'location' ? (
              <LocationStep
                dataRootInfo={dataRootInfo}
                dataRootError={dataRootError}
                locationDraft={locationDraft}
                onLocationDraftChange={setLocationDraft}
                relaunchError={relaunchError}
                onRelaunchErrorChange={setRelaunchError}
                onRetryDataRootInfo={retryDataRootInfo}
                onInteractionStart={() => undefined}
                onBack={() => setStep('terms')}
                onContinue={() => setStep('agent')}
                isResolvingDefaultLocation={dataRootInfo === null && dataRootError === undefined}
                setIsRelaunching={setIsRelaunching}
              />
            ) : step === 'agent' ? (
              <AgentBootstrapStep onContinue={() => setStep('provider')} />
            ) : step === 'provider' ? (
              <ProviderStep
                formValue={providerDraft.value}
                setFormValue={setFormValue}
                providerId={providerDraft.providerId}
                onProviderSaved={recordSavedProvider}
                onBack={() => setStep('location')}
                onAdvance={() => void finishOnboarding()}
                onSkip={() => void finishOnboarding()}
              />
            ) : null}
          </Card>
          {completionError ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {completionError}
            </p>
          ) : null}
        </div>
      </div>
    </main>
  )
}

export { OnboardingWizard }
