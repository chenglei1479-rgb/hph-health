import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

import * as AlertDialog from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  dialogBodyClassName,
  dialogCancelButtonClassName,
  dialogCloseButtonClassName,
  dialogDescriptionClassName,
  dialogFooterClassName,
  dialogHeaderClassName,
  dialogOverlayClassName,
  dialogPanelClassName,
  dialogTitleClassName
} from '@/components/ui/dialog-chrome'

import { clearPackDeliveryLedger } from './pack-delivery-ledger'

const confirmButtonClassName =
  'border-transparent bg-danger-000 text-white hover:bg-danger-000/90 hover:text-white'

type DeleteLocalCopiesButtonProps = {
  canDelete: boolean
  projectIds: readonly string[]
  onDeleteLocalCopies: (projectIds: readonly string[]) => Promise<void>
}

// Deletes the app's own project copies and on-device delivery counts after confirmation.
// Copy must not claim that backups or operating-system copies outside the app are removed.
const DeleteLocalCopiesButton = ({
  canDelete,
  projectIds,
  onDeleteLocalCopies
}: DeleteLocalCopiesButtonProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [done, setDone] = useState(false)

  const close = (): void => {
    if (pending) return
    setOpen(false)
    setError(undefined)
  }

  const confirm = (): void => {
    if (!canDelete || pending) return
    const ids = [...projectIds]
    setPending(true)
    setError(undefined)
    setDone(false)
    void onDeleteLocalCopies(ids)
      .then(() => {
        clearPackDeliveryLedger()
        setOpen(false)
        setDone(true)
      })
      .catch(() => {
        setError(t("Could not delete the app's local copies. Try again."))
      })
      .finally(() => {
        setPending(false)
      })
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        data-testid="delete-local-copies"
        disabled={!canDelete}
        aria-describedby={canDelete ? undefined : 'delete-local-copies-unavailable'}
        onClick={() => {
          setDone(false)
          setError(undefined)
          setOpen(true)
        }}
        className="inline-flex cursor-pointer items-center rounded-xl border border-border-200/70 bg-bg-000 px-3.5 py-2.5 text-left text-sm font-medium text-danger-000 shadow-card hover:border-[#c9b4b0] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t('Delete local copies')}
      </button>
      {!canDelete ? (
        <p id="delete-local-copies-unavailable" className="text-xs text-text-300">
          {t('Retry project recovery before deleting projects.')}
        </p>
      ) : null}
      {done ? (
        <p role="status" data-testid="delete-local-copies-done" className="text-sm text-text-000">
          {t("The app's local copies were deleted.")}
        </p>
      ) : null}
      <AlertDialog.Root
        open={open}
        onOpenChange={(next) => {
          if (!next) close()
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={dialogOverlayClassName} />
          <AlertDialog.Content
            className={dialogPanelClassName('w-[min(440px,calc(100vw-2rem))] p-0')}
            data-testid="delete-local-copies-dialog"
          >
            <div className={dialogHeaderClassName}>
              <div className="min-w-0">
                <AlertDialog.Title className={dialogTitleClassName}>
                  {t("Delete the app's local copies?")}
                </AlertDialog.Title>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('Close')}
                className={dialogCloseButtonClassName}
                disabled={pending}
                onClick={close}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
            <div className={dialogBodyClassName}>
              <AlertDialog.Description className={dialogDescriptionClassName}>
                {t(
                  "This deletes the app's local copies of projects, saved conversations, and on-device delivery counts. Backups and copies stored outside the app, including copies kept by the operating system, are not deleted. Files in a project's working folder are not deleted."
                )}
              </AlertDialog.Description>
              {error ? (
                <p className="mt-4 text-sm text-danger-000" role="alert">
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
                data-testid="delete-local-copies-confirm"
                className={confirmButtonClassName}
                disabled={!canDelete || pending}
                onClick={confirm}
              >
                {pending ? t('Deleting local copies…') : t('Delete local copies')}
              </Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  )
}

export { DeleteLocalCopiesButton }
