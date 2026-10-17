import { AppBrand } from '@/components/AppBrand'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { AccountLoginMethod, AccountState } from '../../../shared/account'
import { isDraPrerelease } from '../../../shared/prerelease'
import { Button } from './ui/button'
import * as Dialog from './ui/dialog'
import {
  dialogOverlayClassName,
  dialogPanelClassName,
  dialogHeaderClassName,
  dialogTitleClassName
} from './ui/dialog-chrome'
import { ErrorNotice } from './error-notice'
import { MembershipPanel } from './MembershipPanel'

const AccountContext = createContext<(() => void) | undefined>(undefined)

export const AccountButton = (): React.JSX.Element | null => {
  const open = useContext(AccountContext)
  const { t } = useTranslation()
  return open ? (
    <Button variant="outline" size="lg" className="px-3" onClick={open}>
      {t('Account')}
    </Button>
  ) : null
}

export const AccountGate = ({ children }: { children: ReactNode }): React.JSX.Element => {
  const { t } = useTranslation()
  const [state, setState] = useState<AccountState>()
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [showMembership, setShowMembership] = useState(false)
  const api = window.api.account
  const refresh = useCallback(async () => {
    if (!api) return
    try {
      setState(await api.getState())
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [api])

  useEffect(() => {
    if (isDraPrerelease() || !api) return
    let live = true
    let timer: ReturnType<typeof setTimeout>
    const poll = async (): Promise<void> => {
      try {
        const next = await api.getState()
        if (live) {
          setState(next)
          setFailed(false)
        }
      } catch {
        if (live) setFailed(true)
      }
      if (live) timer = setTimeout(() => void poll(), 2000)
    }
    void poll()
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [api])

  // Packaged launch smoke reads this once the sign-in screen is actually shown.
  useEffect(() => {
    if (isDraPrerelease() || !api || !state?.required || state.user) return
    document.documentElement.dataset.draLoginReady = '1'
    return () => {
      delete document.documentElement.dataset.draLoginReady
    }
  }, [api, state])

  const login = async (method: AccountLoginMethod, signup = false): Promise<void> => {
    if (!api || busy) return
    setBusy(true)
    try {
      setState(await api.login({ method, signup }))
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  const logout = async (): Promise<void> => {
    if (!api || busy) return
    setBusy(true)
    try {
      setState(await api.logout())
      setOpen(false)
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  // A beta build never shows the login gate and never asks the main process for an account.
  // Browser access belongs to the paired desktop session; the account API is native-only.
  if (isDraPrerelease() || !api) return <>{children}</>
  if (!state || failed)
    return (
      <main className="flex min-h-svh items-center justify-center bg-background p-6">
        <ErrorNotice
          fullPage
          title={failed ? t('Account could not be loaded') : t('Loading account…')}
          primaryButton={failed ? { label: t('Retry'), onClick: () => void refresh() } : undefined}
        />
      </main>
    )

  const error =
    state.error === 'configuration'
      ? t('Account service configuration is invalid.')
      : state.error === 'email-unverified'
        ? t('Verify your email in the browser, then sign in again.')
        : state.error === 'different-owner'
          ? t(
              'This local research profile belongs to another account. Sign in with its owner account.'
            )
          : state.error === 'timeout'
            ? t('Login timed out. Please try again.')
            : state.error === 'login'
              ? t('Login failed. Please try again.')
              : undefined
  const content = (
    <div className="flex w-full flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t('Your DRA account')}</p>
      {state.profile && (
        <p className="text-sm">{t('Local profile: {{profile}}', { profile: state.profile })}</p>
      )}
      {error && <ErrorNotice title={t('Unable to sign in')} description={error} />}
      {!state.configured && !state.required && (
        <p className="text-sm text-muted-foreground">
          {t('Account service has not been configured. Local mode is available.')}{' '}
          {t('DRA sign-in is not required. Model providers may still use the network.')}
        </p>
      )}
      {state.user ? (
        <>
          <p className="break-all text-sm">{state.user.email ?? state.user.name}</p>
          <p className="text-sm text-muted-foreground">
            {t('Research files remain on this computer.')}
          </p>
          <Button variant="outline" onClick={() => setShowMembership((value) => !value)}>
            {t('Membership and plans')}
          </Button>
          <Button disabled={busy} variant="outline" onClick={() => void logout()}>
            {t('Sign out of DRA')}
          </Button>
        </>
      ) : state.pending ? (
        <>
          <p role="status" className="text-sm">
            {t('Complete registration or login in your browser, then return to DRA.')}
          </p>
          <Button disabled={busy} variant="outline" onClick={() => void logout()}>
            {t('Cancel login')}
          </Button>
        </>
      ) : (
        <>
          <Button disabled={busy || !state.configured} onClick={() => void login('email')}>
            {t('Continue with email')}
          </Button>
          <Button
            disabled={busy || !state.configured}
            variant="outline"
            onClick={() => void login('email', true)}
          >
            {t('Create a DRA account')}
          </Button>
          {state.methods.includes('google') && (
            <Button disabled={busy} variant="outline" onClick={() => void login('google')}>
              {t('Continue with Google')}
            </Button>
          )}
          {state.methods.includes('microsoft') && (
            <Button disabled={busy} variant="outline" onClick={() => void login('microsoft')}>
              {t('Continue with Microsoft')}
            </Button>
          )}
          {state.methods.includes('apple') && (
            <Button disabled={busy} variant="outline" onClick={() => void login('apple')}>
              {t('Continue with Apple')}
            </Button>
          )}
          {state.methods.includes('institution') && (
            <Button disabled={busy} variant="outline" onClick={() => void login('institution')}>
              {t('Continue with institution SSO')}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            {t('Email verification and password recovery are available on the browser login page.')}
          </p>
        </>
      )}
    </div>
  )

  if (state.required && !state.user)
    return (
      <main className="flex min-h-svh items-center justify-center bg-background p-6 text-foreground">
        <section className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-sm">
          <h1 aria-label={t('Welcome to DRA')} className="text-3xl font-semibold tracking-tight">
            <AppBrand />
          </h1>
          <div className="mb-6" />
          {content}
        </section>
      </main>
    )

  return (
    <AccountContext.Provider value={() => setOpen(true)}>
      {children}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className={dialogOverlayClassName} />
          <Dialog.Content
            className={dialogPanelClassName(
              `w-[calc(100vw-2rem)] ${showMembership ? 'max-w-2xl' : 'max-w-sm'} p-0 max-h-[90svh] overflow-y-auto`
            )}
            aria-describedby={undefined}
          >
            <div className={dialogHeaderClassName}>
              <Dialog.Title className={dialogTitleClassName}>{t('Account')}</Dialog.Title>
            </div>
            <div className="space-y-6 p-6">
              {content}
              {showMembership && state.user && (
                <MembershipPanel
                  membership={state.membership}
                  onCheckNotebookAccess={
                    api.checkNotebookAccess
                      ? async () => {
                          const result = await api.checkNotebookAccess!()
                          setState(result.state)
                          return result
                        }
                      : undefined
                  }
                />
              )}
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" className="mx-6 mb-4">
                {t('Close')}
              </Button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </AccountContext.Provider>
  )
}
