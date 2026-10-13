import { Notice } from '@/components/notice'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { AppIconPreview } from '../../../../shared/settings'
import { SettingsSection } from './SettingsLayout'

const AppIconSection = (): React.JSX.Element | null => {
  const { t } = useTranslation()
  const [previews, setPreviews] = useState<AppIconPreview[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const listAppIcons = window.api.settings.listAppIcons

  useEffect(() => {
    if (!listAppIcons) return

    let active = true
    void Promise.resolve()
      .then(() => listAppIcons())
      .then((result) => {
        if (active) {
          setPreviews(result)
          setLoadState('ready')
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to load app icon previews', error)
        if (active) setLoadState('error')
      })
    return () => {
      active = false
    }
  }, [attempt, listAppIcons])

  if (!listAppIcons) return null

  const labels = { light: t('Light'), dark: t('Dark') }
  const orderedPreviews = [...previews].sort((left, right) =>
    left.id === right.id ? 0 : left.id === 'light' ? -1 : 1
  )

  return (
    <SettingsSection
      title={t('App icon')}
      description={t(
        'The app icon follows the active theme and switches between light and dark automatically.'
      )}
      aria-label={t('App icon')}
    >
      {loadState === 'loading' ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t('Loading app icons…')}
        </p>
      ) : null}
      {loadState === 'error' ? (
        <Notice
          level="error"
          role="alert"
          description={t('Could not load app icons.')}
          primaryButton={{
            label: t('Retry'),
            onClick: () => {
              setLoadState('loading')
              setAttempt((value) => value + 1)
            }
          }}
        />
      ) : null}
      {loadState === 'ready' && orderedPreviews.length === 0 ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t('No app icons are available.')}
        </p>
      ) : null}
      {loadState === 'ready' && orderedPreviews.length > 0 ? (
        <div className="flex flex-wrap gap-3" aria-label={t('App icon')}>
          {orderedPreviews.map((preview) => (
            <div
              key={preview.id}
              className="flex w-28 flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 text-center"
            >
              <img
                src={preview.previewDataUrl}
                alt=""
                aria-hidden="true"
                className="size-14 rounded-2xl"
              />
              <span className="text-xs font-medium text-foreground">{labels[preview.id]}</span>
            </div>
          ))}
        </div>
      ) : null}
    </SettingsSection>
  )
}

export { AppIconSection }
