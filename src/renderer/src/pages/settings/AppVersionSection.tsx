import { AppBrand } from '@/components/AppBrand'
import { InlineNotice } from '@/components/ui/inline-notice'
/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5 */
/* Hallmark · component: Settings About · macrostructure: identity + resource list
 * genre: modern-minimal · theme: DRA Settings
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass (semantic Settings tokens) · slop: pass
 */
import { CircleHelp, Download, FileText, RefreshCw, Scale } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import licenseText from '../../../../../LICENSE?raw'
import noticeText from '../../../../../NOTICE?raw'
import thirdPartyNoticesText from '../../../../../THIRD_PARTY_NOTICES.txt?raw'
import * as Dialog from '@/components/ui/dialog'
import {
  dialogDescriptionClassName,
  dialogOverlayClassName,
  dialogPanelClassName,
  dialogTitleClassName
} from '@/components/ui/dialog-chrome'

import { license as licenseId } from '../../../../../package.json'
import { AppLogo } from '@/components/AppLogo'
import { ExternalTextLink } from '@/components/ExternalTextLink'
import { Button } from '@/components/ui/button'
import { useUpdateStore } from '@/stores/update-store'
import { APP } from '../../../../shared/app-config'
import { SettingsRow, SettingsSection } from './SettingsLayout'

export type AppVersionSectionPreviewState =
  'default' | 'hover' | 'focus' | 'active' | 'disabled' | 'loading' | 'error' | 'success'

type AppVersionSectionProps = {
  previewState?: AppVersionSectionPreviewState
}

const resourceLinkClassName =
  'group flex min-h-14 w-full gap-3 rounded-lg px-1 py-3 text-foreground no-underline transition-[color,background-color,transform] duration-150 ease-out motion-reduce:transition-none hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px'

const resourceIconClassName =
  'size-5 shrink-0 text-muted-foreground transition-colors duration-150 motion-reduce:transition-none group-hover:text-primary group-focus-visible:text-primary group-[.is-hover]:text-primary group-[.is-focus]:text-primary'

const resourceTitleClassName =
  'block whitespace-nowrap text-sm font-medium transition-transform duration-150 ease-out motion-reduce:transition-none [@media(hover:hover)_and_(pointer:fine)]:translate-y-2.5 [@media(hover:hover)_and_(pointer:fine)]:group-hover:translate-y-0 [@media(hover:hover)_and_(pointer:fine)]:group-focus-visible:translate-y-0 [@media(any-pointer:coarse)]:!translate-y-0 group-[.is-hover]:translate-y-0 group-[.is-focus]:translate-y-0'

const resourceDescriptionClassName =
  'mt-0.5 block text-[13px] leading-5 text-muted-foreground transition-opacity duration-150 ease-out motion-reduce:transition-none [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:group-focus-visible:opacity-100 [@media(any-pointer:coarse)]:!opacity-100 group-[.is-hover]:opacity-100 group-[.is-focus]:opacity-100'

// App identity + update control in Settings→General. Reads the shared update store so it stays in
// sync with the external capsule; the update button opens the shared dialog (version + notes +
// download), so the download/confirm UX lives in one place.
const AppVersionSection = ({
  previewState = 'default'
}: AppVersionSectionProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [licensesOpen, setLicensesOpen] = useState(false)
  const appInfo = useUpdateStore((state) => state.appInfo)
  const status = useUpdateStore((state) => state.status)
  const check = useUpdateStore((state) => state.check)
  const openDialog = useUpdateStore((state) => state.openDialog)

  const version = appInfo?.version ?? status.current
  const isChecking = status.state === 'checking'
  const isDownloading = status.state === 'downloading'
  const canCheck = status.state !== 'disabled' && !isChecking && !isDownloading
  const hasUpdate = status.state === 'available' || isDownloading || status.state === 'ready'
  const helpPreviewClassName =
    previewState === 'hover'
      ? 'is-hover bg-muted'
      : previewState === 'focus'
        ? 'is-focus ring-3 ring-ring/50'
        : previewState === 'active'
          ? 'translate-y-px'
          : ''

  const statusLine = ((): string => {
    if (status.error) return status.error
    switch (status.state) {
      case 'disabled':
        return t('Automatic updates are disabled until a DRA update service is configured.')
      case 'checking':
        return t('Checking for updates…')
      case 'available':
        return t('New version {{version}} is available', { version: status.latest })
      case 'downloading':
        return t('Downloading… {{percent}}%', { percent: status.progress ?? 0 })
      case 'ready':
        return status.applyKind === 'restart'
          ? t('Restart to update')
          : t('Update downloaded — open the installer to finish')
      case 'up-to-date':
        return t('You are on the latest version')
      case 'error':
        // Backend-supplied failure text passes through verbatim in every locale.
        return status.error ?? t('Update check failed')
      default:
        return ''
    }
  })()

  return (
    <SettingsSection title={t('About')} aria-label={t('App version')}>
      <SettingsRow
        label={
          <div className="flex min-w-0 items-center gap-3">
            <AppLogo className="size-12 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <AppBrand showLogo={false} />
                <span className="text-xs text-muted-foreground tabular-nums">v{version}</span>
              </p>
              <p className="mt-0.5 text-xs font-normal text-muted-foreground">{APP.copyright}</p>
              <p className="mt-0.5 text-xs font-normal text-muted-foreground" lang="ja">
                {t('Developed based on AIPOCH Open-Science.', { lng: 'ja' })}
              </p>
              {statusLine ? (
                !status.error && status.state !== 'error' ? (
                  <p className="mt-1 text-xs text-muted-foreground" role="status">
                    {statusLine}
                  </p>
                ) : (
                  <InlineNotice level="error" role="alert" className="mt-2">
                    {statusLine}
                  </InlineNotice>
                )
              ) : null}
            </div>
          </div>
        }
        className="pt-0 sm:grid-cols-[minmax(0,1fr)_auto]"
      >
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => void check()} disabled={!canCheck}>
            <RefreshCw
              className={isChecking ? 'size-4 animate-spin' : 'size-4'}
              aria-hidden="true"
            />
            {isChecking ? t('Checking…') : t('Check now')}
          </Button>

          {hasUpdate ? (
            <Button type="button" onClick={() => openDialog()}>
              <Download className="size-4" aria-hidden="true" />
              {isDownloading
                ? t('Downloading {{percent}}%', { percent: status.progress ?? 0 })
                : status.state === 'ready'
                  ? t('Update ready')
                  : t('Update to {{version}}', { version: status.latest })}
            </Button>
          ) : null}
        </div>
      </SettingsRow>

      <div>
        <ExternalTextLink
          href={APP.links.docs}
          aria-label={t('Open Help Center in your browser')}
          className={`${resourceLinkClassName} ${helpPreviewClassName}`}
        >
          <CircleHelp
            data-slot="about-resource-icon"
            className={resourceIconClassName}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">
            <span data-slot="about-resource-title" className={resourceTitleClassName}>
              {t('Help Center')}
            </span>
            <span data-slot="about-resource-description" className={resourceDescriptionClassName}>
              {t('Read setup guides and troubleshooting.')}
            </span>
          </span>
        </ExternalTextLink>

        <ExternalTextLink
          href={APP.links.githubReleases}
          aria-label={t('Open release notes in your browser')}
          className={resourceLinkClassName}
        >
          <FileText
            data-slot="about-resource-icon"
            className={resourceIconClassName}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">
            <span data-slot="about-resource-title" className={resourceTitleClassName}>
              {t('Release notes')}
            </span>
            <span data-slot="about-resource-description" className={resourceDescriptionClassName}>
              {t('See changes and fixes in every version.')}
            </span>
          </span>
        </ExternalTextLink>
        <ExternalTextLink
          href={APP.links.license}
          aria-label={t('Open-source license')}
          className={resourceLinkClassName}
        >
          <Scale
            data-slot="about-resource-icon"
            className={resourceIconClassName}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">
            <span data-slot="about-resource-title" className={resourceTitleClassName}>
              {t('Open-source license')}
            </span>
            <span data-slot="about-resource-description" className={resourceDescriptionClassName}>
              {licenseId}
            </span>
          </span>
        </ExternalTextLink>
        <button
          type="button"
          aria-label={t('Licenses')}
          className={`${resourceLinkClassName} text-left`}
          onClick={() => setLicensesOpen(true)}
        >
          <Scale className={resourceIconClassName} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className={resourceTitleClassName}>{t('Licenses')}</span>
            <span className={resourceDescriptionClassName}>
              {t('Read the project license, notices, and third-party notices.')}
            </span>
          </span>
        </button>
      </div>
      <Dialog.Root open={licensesOpen} onOpenChange={setLicensesOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className={dialogOverlayClassName} />
          <Dialog.Content
            className={dialogPanelClassName('flex w-[min(40rem,calc(100vw-2rem))] flex-col')}
            aria-describedby={undefined}
          >
            <Dialog.Title className={dialogTitleClassName}>{t('Licenses')}</Dialog.Title>
            <Dialog.Description className={dialogDescriptionClassName}>
              {t('Read the project license, notices, and third-party notices.')}
            </Dialog.Description>
            <p className="mt-3 text-sm" lang="ja">
              {t('Developed based on AIPOCH Open-Science.', { lng: 'ja' })}
            </p>
            <section className="mt-4 min-w-0">
              <h3 className="text-sm font-medium">{t('Project license (LICENSE)')}</h3>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs leading-5 text-foreground">
                {licenseText}
              </pre>
            </section>
            <section className="mt-4 min-w-0">
              <h3 className="text-sm font-medium">{t('Notices (NOTICE)')}</h3>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs leading-5 text-foreground">
                {noticeText}
              </pre>
            </section>
            <section className="mt-4 min-w-0">
              <h3 className="text-sm font-medium">{t('Third-party notices')}</h3>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs leading-5 text-foreground">
                {thirdPartyNoticesText}
              </pre>
            </section>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </SettingsSection>
  )
}

export { AppVersionSection }
