import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { APP } from '../../../../shared/app-config'
import * as AlertDialog from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  dialogBodyClassName,
  dialogCancelButtonClassName,
  dialogFooterClassName,
  dialogHeaderClassName,
  dialogOverlayClassName,
  dialogPanelClassName,
  dialogTitleClassName
} from '@/components/ui/dialog-chrome'

const confirmButtonClassName =
  'border-transparent bg-danger-000 text-white hover:bg-danger-000/90 hover:text-white'

type DeleteDevicePatientDataProps = {
  projectId: string
  canDelete?: boolean
  onDelete?: (projectId: string) => Promise<void>
}

const deletedCategories = [
  "Imported copies of this project's data",
  'Notebook caches for this project',
  "Analysis intermediate results, including results inside this project's working folder"
] as const

// Per-project removal of imported copies, notebook caches, and analysis intermediates.
// Conversations stay. Original source files outside the app stay.
const DeleteDevicePatientData = ({
  projectId,
  canDelete = true,
  onDelete = (id) => window.api.projects.deleteDevicePatientData({ id })
}: DeleteDevicePatientDataProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [step, setStep] = useState<'closed' | 'review' | 'confirm'>('closed')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [done, setDone] = useState(false)
  const productName = APP.name

  const close = (): void => {
    if (pending) return
    setStep('closed')
    setError(undefined)
  }

  const confirm = (): void => {
    if (!canDelete || pending || step !== 'confirm') return
    setPending(true)
    setError(undefined)
    setDone(false)
    void onDelete(projectId)
      .then(() => {
        setStep('closed')
        setDone(true)
      })
      .catch(() => {
        setError(t('Could not delete patient data for this project on this device. Try again.'))
      })
      .finally(() => {
        setPending(false)
      })
  }

  return (
    <div className="space-y-2 border-t border-border-200/70 pt-4">
      <button
        type="button"
        data-testid="delete-device-patient-data"
        disabled={!canDelete}
        onClick={() => {
          setDone(false)
          setError(undefined)
          setStep('review')
        }}
        className="inline-flex cursor-pointer items-center rounded-xl border border-border-200/70 bg-bg-000 px-3.5 py-2.5 text-left text-sm font-medium text-danger-000 shadow-card hover:border-danger-000/55 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t('Delete patient data on this device')}
      </button>
      {!canDelete ? (
        <p className="text-xs text-text-300">
          {t('Retry project recovery before deleting projects.')}
        </p>
      ) : null}
      {done ? (
        <p
          role="status"
          data-testid="delete-device-patient-data-done"
          className="text-sm text-text-000"
        >
          {t('Patient data stored for this project on this device was deleted.')}
        </p>
      ) : null}
      <AlertDialog.Root
        open={step === 'review'}
        onOpenChange={(next) => {
          if (!next) close()
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={dialogOverlayClassName} />
          <AlertDialog.Content
            className={dialogPanelClassName('w-[min(480px,calc(100vw-2rem))] p-0')}
            data-testid="delete-device-patient-data-review"
          >
            <div className={dialogHeaderClassName}>
              <AlertDialog.Title className={dialogTitleClassName}>
                {t('Delete patient data on this device')}
              </AlertDialog.Title>
            </div>
            <div className={`${dialogBodyClassName} space-y-3`}>
              <AlertDialog.Description className="sr-only">
                {t(
                  "{{productName}} will delete data it stores. When disposing of or transferring this device, follow your institution's procedure.",
                  { productName }
                )}
              </AlertDialog.Description>
              <p className="text-sm leading-6 text-text-000">
                {t(
                  "{{productName}} will delete data it stores. When disposing of or transferring this device, follow your institution's procedure.",
                  { productName }
                )}
              </p>
              <p className="text-sm leading-6 text-text-000">
                {t(
                  'Original source files that were imported, such as Excel workbooks, are not deleted by {{productName}}. Delete them yourself according to the method in the research protocol.',
                  { productName }
                )}
              </p>
              <p className="text-sm leading-6 text-text-000">
                {t(
                  'Check the retention period and storage location specified in the research protocol before you delete.'
                )}
              </p>
              <p className="text-sm leading-6 text-text-000">
                {t('Before deleting, export code and result tables that contain no patient data.')}
              </p>
            </div>
            <div className={dialogFooterClassName}>
              <AlertDialog.Cancel asChild>
                <Button type="button" variant="ghost" className={dialogCancelButtonClassName}>
                  {t('Cancel')}
                </Button>
              </AlertDialog.Cancel>
              <Button
                type="button"
                data-testid="delete-device-patient-data-continue"
                onClick={() => setStep('confirm')}
              >
                {t('Continue')}
              </Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <AlertDialog.Root
        open={step === 'confirm'}
        onOpenChange={(next) => {
          if (!next) close()
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={dialogOverlayClassName} />
          <AlertDialog.Content
            className={dialogPanelClassName('w-[min(480px,calc(100vw-2rem))] p-0')}
            data-testid="delete-device-patient-data-confirm-dialog"
          >
            <div className={dialogHeaderClassName}>
              <AlertDialog.Title className={dialogTitleClassName}>
                {t('Confirm the patient data that will be deleted')}
              </AlertDialog.Title>
            </div>
            <div className={dialogBodyClassName}>
              <AlertDialog.Description className="sr-only">
                {t('Confirm the patient data that will be deleted')}
              </AlertDialog.Description>
              <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-text-000">
                {deletedCategories.map((category) => (
                  <li key={category}>{t(category)}</li>
                ))}
              </ul>
              <p className="mt-3 text-sm leading-6 text-text-000">
                {t('Conversations in this project are not deleted.')}
              </p>
              {error ? (
                <p className="mt-3 text-sm text-danger-000" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
            <div className={dialogFooterClassName}>
              <AlertDialog.Cancel asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className={dialogCancelButtonClassName}
                  disabled={pending}
                >
                  {t('Cancel')}
                </Button>
              </AlertDialog.Cancel>
              <Button
                type="button"
                data-testid="delete-device-patient-data-confirm"
                className={confirmButtonClassName}
                disabled={!canDelete || pending}
                onClick={confirm}
              >
                {pending
                  ? t('Deleting patient data on this device…')
                  : t('Delete patient data on this device')}
              </Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  )
}

export { DeleteDevicePatientData }
