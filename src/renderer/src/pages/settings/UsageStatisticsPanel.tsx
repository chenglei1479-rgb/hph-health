import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { version as appVersion } from '../../../../../package.json'

import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  USAGE_STATISTICS_ENDPOINT,
  isUsageStatisticsPlaceholder
} from '../../../../shared/usage-statistics'
import { SettingsSection } from './SettingsLayout'
import {
  previewUsageStatisticsPayload,
  readOrCreateUsageInstallId,
  readUsageOptIn,
  resetUsageInstallId,
  writeUsageOptIn
} from './usage-statistics-preference'

const UsageStatisticsPanel = (): React.JSX.Element => {
  const { t } = useTranslation()
  const [optIn, setOptIn] = useState(() => readUsageOptIn())
  const [installId, setInstallId] = useState(() => readOrCreateUsageInstallId())
  const placeholder = isUsageStatisticsPlaceholder(USAGE_STATISTICS_ENDPOINT)
  const payload = previewUsageStatisticsPayload(
    installId,
    appVersion,
    typeof navigator === 'undefined' ? 'other' : navigator.platform
  )

  return (
    <div className="flex flex-col gap-6 p-5">
      <SettingsSection
        title={t('Anonymous usage statistics')}
        description={t(
          'This is the exact payload. It contains an install id, the app version, a coarse operating system, and event names with counts.'
        )}
        action={
          <Switch
            checked={optIn}
            aria-label={t('Send anonymous usage statistics')}
            onCheckedChange={(checked) => {
              writeUsageOptIn(checked)
              setOptIn(checked)
            }}
          />
        }
      >
        <p className="text-[13px] leading-5 text-muted-foreground">
          {t('Prompts, file names, paths, and model output are never included.')}
        </p>
        <p className="mt-2 text-[13px] leading-5 text-muted-foreground">
          {optIn
            ? placeholder
              ? t('Sending is disabled while the endpoint is a placeholder.')
              : t('Anonymous usage statistics are on.')
            : t('Usage statistics are off.')}
        </p>
        <p className="mt-2 font-mono text-[12px] break-all text-text-200">
          {USAGE_STATISTICS_ENDPOINT}
        </p>
        <pre
          className="mt-3 overflow-x-auto rounded-md bg-bg-100 p-3 text-[12px] leading-5"
          data-settings-anchor="usage-statistics.payload"
          data-testid="usage-statistics-payload"
        >
          {JSON.stringify(payload, null, 2)}
        </pre>
        <div className="mt-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setInstallId(resetUsageInstallId())}
          >
            {t('Reset install id')}
          </Button>
        </div>
        <p className="mt-3 text-[13px] leading-5 text-muted-foreground">
          {t('Japanese privacy notice (placeholder until legal review)')}
        </p>
      </SettingsSection>
    </div>
  )
}

export { UsageStatisticsPanel }
