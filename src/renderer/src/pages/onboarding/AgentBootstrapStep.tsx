import { LoaderCircle, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { CardContent, CardDescription, CardFooter, CardHeader } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useSettingsStore } from '@/stores/settings-store'
import { onboardingErrorMessage } from './onboarding-error'

type AgentBootstrapStepProps = {
  onContinue: () => void
}

// TODO(leo-decision): beta default agent runtime — resolved 2026-10-19 as Codex CLI. OpenCode stays
// available as a manual Settings alternative; changing the stored default is out of this PR's scope.
// Beta setup pins the runtime to Codex CLI. There is no choice surface: when the runtime is missing
// the app installs it in the background, then advances on its own. The page is only visible while
// that happens (or when it fails), so the normal path costs the doctor no click.
const AgentBootstrapStep = ({ onContinue }: AgentBootstrapStepProps): React.JSX.Element => {
  const { t } = useTranslation()
  const agentFrameworkId = useSettingsStore((state) => state.agentFrameworkId)
  const setAgentFramework = useSettingsStore((state) => state.setAgentFramework)
  const environmentCheck = useSettingsStore((state) => state.environmentCheck)
  const isCheckingEnvironment = useSettingsStore((state) => state.isCheckingEnvironment)
  const checkEnvironment = useSettingsStore((state) => state.checkEnvironment)
  const installCodex = useSettingsStore((state) => state.installCodex)
  const installState = useSettingsStore((state) => state.installStates.codex)
  const [attempted, setAttempted] = useState(false)
  const [installError, setInstallError] = useState<string | undefined>(undefined)
  const switchedFramework = useRef(false)
  const startedInstall = useRef(false)

  // Convert installs created before the beta default to the fixed beta runtime exactly once.
  useEffect(() => {
    if (agentFrameworkId === 'codex' || switchedFramework.current) return
    switchedFramework.current = true
    void setAgentFramework('codex')
      .then(() => checkEnvironment({ force: true }))
      .catch((error) => {
        setInstallError(onboardingErrorMessage(error, t('Could not prepare the agent runtime.')))
      })
  }, [agentFrameworkId, checkEnvironment, setAgentFramework, t])

  // A ready Codex runtime (detected or just installed) advances without a separate Continue click.
  useEffect(() => {
    if (
      agentFrameworkId === 'codex' &&
      !isCheckingEnvironment &&
      environmentCheck?.agentFrameworkId === 'codex' &&
      environmentCheck.ready
    ) {
      onContinue()
    }
  }, [agentFrameworkId, environmentCheck, isCheckingEnvironment, onContinue])

  const runInstall = useCallback(async (): Promise<void> => {
    if (startedInstall.current) return
    startedInstall.current = true
    setInstallError(undefined)
    setAttempted(true)
    try {
      const result = await installCodex()
      if (!result.ok) {
        setInstallError(result.error ?? t('Could not install the agent runtime.'))
      }
      await checkEnvironment({ force: true })
    } catch (error) {
      setInstallError(onboardingErrorMessage(error, t('Could not install the agent runtime.')))
    } finally {
      startedInstall.current = false
    }
  }, [checkEnvironment, installCodex, t])

  // Automatic install is opportunistic: only after the host check proves automatic setup is possible.
  useEffect(() => {
    if (
      agentFrameworkId !== 'codex' ||
      isCheckingEnvironment ||
      !environmentCheck ||
      environmentCheck.agentFrameworkId !== 'codex' ||
      environmentCheck.ready ||
      !environmentCheck.canAutoInstall ||
      attempted ||
      installState.isInstalling
    ) {
      return
    }
    queueMicrotask(() => void runInstall())
  }, [
    agentFrameworkId,
    attempted,
    environmentCheck,
    installState.isInstalling,
    isCheckingEnvironment,
    runInstall
  ])

  const failure = installError ?? installState.installError
  const installing = installState.isInstalling || (!environmentCheck && isCheckingEnvironment)

  return (
    <>
      <CardHeader className="gap-1 rounded-t-lg px-6 py-5">
        <h2 tabIndex={-1} className="text-[15px] font-semibold">
          {t('Preparing the agent runtime')}
        </h2>
        <CardDescription className="text-xs leading-5">
          {t(
            'Baselio installs Codex CLI in the background. You do not need to choose a runtime during setup.'
          )}
        </CardDescription>
      </CardHeader>
      <Separator className="bg-border-200" />
      <CardContent className="flex-1 px-6 py-5">
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-border-200 bg-bg-10 px-4 py-3 text-sm"
        >
          {installing ? (
            <LoaderCircle
              className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <RefreshCw className="size-4 shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0 flex-1">
            {failure
              ? failure
              : installing
                ? t('Installing Codex CLI…')
                : t('Waiting for the agent runtime…')}
          </span>
        </div>
        {installState.installLogs.length > 0 ? (
          <pre className="mt-3 max-h-40 overflow-y-auto rounded-lg bg-bg-10 p-3 text-[11px] leading-5 text-text-200">
            {installState.installLogs.join('')}
          </pre>
        ) : null}
        {failure ? (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {t('You can retry, or continue setup and repair the runtime later in Settings.')}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="mt-auto items-center justify-between gap-4 rounded-b-lg border-border-200 bg-bg-10 px-6 py-3">
        <p className="text-xs leading-5 text-text-100">
          {t('Codex CLI is the fixed runtime for the beta.')}
        </p>
        <div className="flex items-center gap-2">
          {failure ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setAttempted(false)
                  setInstallError(undefined)
                  void checkEnvironment({ force: true })
                }}
                disabled={installState.isInstalling}
              >
                {t('Check again')}
              </Button>
              <Button type="button" variant="outline" onClick={onContinue}>
                {t('Continue anyway')}
              </Button>
            </>
          ) : null}
          <Button
            type="button"
            onClick={() => {
              setAttempted(false)
              void runInstall()
            }}
            disabled={installing || installState.isInstalling}
            className="px-4"
          >
            {installing ? t('Installing…') : t('Install again')}
          </Button>
        </div>
      </CardFooter>
    </>
  )
}

export { AgentBootstrapStep }
