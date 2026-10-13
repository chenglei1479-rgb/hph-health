import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import type { NotebookAccessCheck } from '../../../shared/account'
import { Button } from './ui/button'
import type { MembershipPlan, MembershipState } from '../../../shared/membership'
import { MEMBERSHIP_PRICES } from '../../../shared/membership'

export const MembershipPanel = ({
  membership,
  localMode = false,
  onCheckNotebookAccess
}: {
  membership?: MembershipState
  localMode?: boolean
  onCheckNotebookAccess?: () => Promise<NotebookAccessCheck>
}): React.JSX.Element => {
  const { t, i18n } = useTranslation()
  const [check, setCheck] = useState<NotebookAccessCheck>()
  const [checking, setChecking] = useState(false)
  const [checkFailed, setCheckFailed] = useState<string>()
  const membershipKey = JSON.stringify(membership ?? { plan: 'free', status: 'free' })
  const visibleCheck =
    check && JSON.stringify(check.state.membership) === membershipKey ? check : undefined
  const checkAccess = async (): Promise<void> => {
    if (!onCheckNotebookAccess || checking) return
    setChecking(true)
    setCheck(undefined)
    setCheckFailed(undefined)
    try {
      setCheck(await onCheckNotebookAccess())
    } catch {
      setCheckFailed(membershipKey)
    } finally {
      setChecking(false)
    }
  }
  const current = membership?.plan ?? 'free'
  const labels: Record<MembershipPlan, string> = { free: t('Free'), plus: t('Plus'), pro: t('Pro') }
  const benefits: Record<MembershipPlan, string[]> = {
    free: [
      t('Research chat and literature workflows'),
      t('View existing research files and results')
    ],
    plus: [t('All Free features'), t('Notebook execution'), t('Research package export')],
    pro: [
      t('All Plus features'),
      t('Multiple research agents'),
      t('Background execution'),
      t('AI review')
    ]
  }
  return (
    <section className="space-y-3" aria-label={t('Membership')} data-testid="membership-panel">
      <h2 className="text-base font-semibold">{t('Membership')}</h2>
      <p className="text-sm text-muted-foreground">
        {localMode
          ? t('Membership is unavailable in local mode.')
          : t('Current plan: {{plan}}', { plan: labels[current] })}
      </p>
      {membership?.status === 'expired' && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('Membership expired. Free features remain available.')}
        </p>
      )}
      {membership?.status === 'active' && membership.validUntil && (
        <p className="text-xs text-muted-foreground">
          {t('Active until {{date}}', {
            date: new Intl.DateTimeFormat(i18n.language, {
              dateStyle: 'medium',
              timeStyle: 'short'
            }).format(membership.validUntil)
          })}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {(['free', 'plus', 'pro'] as const).map((plan) => (
          <article key={plan} className="rounded-lg border p-3" data-plan={plan}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{labels[plan]}</h3>
              {!localMode && plan === current && (
                <span className="rounded bg-muted px-2 py-0.5 text-xs">{t('Current plan')}</span>
              )}
            </div>
            <p className="mt-2 text-lg font-semibold">
              {plan === 'free' ? '$0' : `$${MEMBERSHIP_PRICES[plan]}`}{' '}
              <span className="text-xs font-normal text-muted-foreground">{t('USD / month')}</span>
            </p>
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              {benefits[plan].map((benefit) => (
                <li key={benefit}>{benefit}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {t('Contact your administrator to activate Plus or Pro. Sign in again after activation.')}
      </p>
      {onCheckNotebookAccess && !localMode && (
        <div className="space-y-2 rounded-lg border p-3">
          <Button variant="outline" disabled={checking} onClick={() => void checkAccess()}>
            {checking ? t('Checking permissions…') : t('Check Notebook permissions')}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t(
              'This checks account permissions only; it does not run Python or verify tool availability.'
            )}
          </p>
          {checkFailed === membershipKey && (
            <p role="alert">{t('Permission check failed. Please retry.')}</p>
          )}
          {visibleCheck && (
            <div role="status" className="space-y-1 text-sm">
              <p>
                {visibleCheck.foreground.allowed
                  ? t('Notebook permissions: allowed')
                  : t('Notebook permissions: Plus required')}
              </p>
              <p>
                {visibleCheck.background.allowed
                  ? t('Background permissions: allowed')
                  : t('Background permissions: Pro required')}
              </p>
              {visibleCheck.foreground.error && (
                <code className="block break-all text-xs">{visibleCheck.foreground.error}</code>
              )}
              {visibleCheck.background.error && (
                <code className="block break-all text-xs">{visibleCheck.background.error}</code>
              )}
              <p className="text-xs text-muted-foreground">
                {t('Checked at {{time}}', {
                  time: new Intl.DateTimeFormat(i18n.language, {
                    dateStyle: 'medium',
                    timeStyle: 'medium'
                  }).format(visibleCheck.checkedAt)
                })}
              </p>
            </div>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {t(
          'Online payment is not available yet. Membership does not include model API charges or cloud compute.'
        )}
      </p>
    </section>
  )
}
