import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { errorNoticeDetail } from '@/lib/error-detail'
import type { MachineApprovalStatus } from '../../../../shared/machine-approval'
import { SettingsSection } from './SettingsLayout'

const MachineApprovalSection = (): React.JSX.Element => {
  const { t } = useTranslation()
  const [status, setStatus] = useState<MachineApprovalStatus | null>(null)
  const [approvalNumber, setApprovalNumber] = useState('')
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  const refresh = useCallback((): Promise<void> => {
    return window.api.machineApproval.getStatus().then(
      (next) => {
        setStatus(next)
        setError(undefined)
      },
      (cause: unknown) => {
        setError(errorNoticeDetail(cause, t) ?? t('Could not read hospital approval.'))
      }
    )
  }, [t])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const approve = (): void => {
    const number = approvalNumber.trim()
    if (number.length === 0) {
      setError(t('Enter the hospital approval number.'))
      return
    }
    setPending(true)
    void window.api.machineApproval
      .setStatus({ approved: true, approvalNumber: number })
      .then(
        (next) => {
          setStatus(next)
          setApprovalNumber('')
          setError(undefined)
        },
        (cause: unknown) => {
          setError(errorNoticeDetail(cause, t) ?? t('Could not update hospital approval.'))
        }
      )
      .finally(() => setPending(false))
  }

  const revoke = (): void => {
    setPending(true)
    void window.api.machineApproval.setStatus({ approved: false }).then(
      (next) => {
        setStatus(next)
        setError(undefined)
        setPending(false)
      },
      (cause: unknown) => {
        setError(errorNoticeDetail(cause, t) ?? t('Could not update hospital approval.'))
        setPending(false)
      }
    )
  }

  return (
    <SettingsSection
      title={t('Hospital approval')}
      description={t(
        'Patient information can be de-identified and sent only after this machine is approved by the hospital. A change is appended to the local audit log.'
      )}
    >
      <p className="text-sm text-foreground">
        {status?.approved
          ? t('Approved under {{number}}.', { number: status.approvalNumber ?? '' })
          : t('This machine is not approved.')}
      </p>
      {status?.at ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {t('Recorded {{at}}.', { at: status.at })}
        </p>
      ) : null}
      <label className="mt-3 block text-sm text-foreground" htmlFor="hospital-approval-number">
        {t('Approval number')}
        <input
          id="hospital-approval-number"
          className="mt-1 block h-8 w-full max-w-sm rounded-lg border border-border bg-card px-2 text-sm"
          value={approvalNumber}
          autoComplete="off"
          onChange={(event) => setApprovalNumber(event.target.value)}
        />
      </label>
      {error ? <p className="mt-2 text-sm text-status-failure">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={pending || approvalNumber.trim().length === 0}
          onClick={approve}
        >
          {t('Approve this machine')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending || !status?.approved}
          onClick={revoke}
        >
          {t('Revoke approval')}
        </Button>
      </div>
    </SettingsSection>
  )
}

export { MachineApprovalSection }
