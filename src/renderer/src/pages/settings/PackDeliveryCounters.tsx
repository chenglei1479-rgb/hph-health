import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DELIVERY_PACK_IDS } from '../../../../shared/deliverable-next-step'
import { deliveryPackTitle } from '../home/delivery-pack-title'
import { usePackDeliveryLedger } from '../home/pack-delivery-ledger'
import { SettingsSection } from './SettingsLayout'

export const PackDeliveryCounters = (): React.JSX.Element => {
  const { t } = useTranslation()
  const ledger = usePackDeliveryLedger()
  const [copied, setCopied] = useState(false)
  const used = DELIVERY_PACK_IDS.filter((id) => (ledger.byPack[id] ?? 0) > 0)
  const lines = [
    `${t('Deliveries completed')}: ${ledger.totalCompleted}`,
    t('Packs used'),
    ...(used.length === 0
      ? [t('No pack deliveries yet.')]
      : used.map((id) => `${deliveryPackTitle(t, id)}: ${ledger.byPack[id] ?? 0}`))
  ]
  return (
    <SettingsSection
      data-settings-anchor="general.pack-deliveries"
      title={t('Pack deliveries on this device')}
      description={t(
        'Counts of finished pack deliveries stay on this computer. Copy them into a paper log. They are not uploaded.'
      )}
      aria-label={t('Pack deliveries on this device')}
    >
      <p className="text-sm">
        {t('Deliveries completed')}: {ledger.totalCompleted}
      </p>
      <h3 className="mt-3 text-sm font-medium">{t('Packs used')}</h3>
      {used.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">{t('No pack deliveries yet.')}</p>
      ) : (
        <ul className="mt-1 space-y-1 text-sm">
          {used.map((id) => (
            <li key={id}>
              {deliveryPackTitle(t, id)}: {ledger.byPack[id] ?? 0}
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="mt-3 rounded-md border border-border bg-card px-3 py-1.5 text-sm"
        onClick={() => {
          const text = lines.join('\n')
          const write = navigator.clipboard?.writeText
          if (!write) return
          void write.call(navigator.clipboard, text).then(() => setCopied(true))
        }}
      >
        {t('Copy counts')}
      </button>
      {copied ? <p role="status">{t('Counts copied.')}</p> : null}
    </SettingsSection>
  )
}
