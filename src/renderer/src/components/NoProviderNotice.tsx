import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { selectHasUsableModel, useSettingsStore } from '@/stores/settings-store'

type NoProviderNoticeProps = {
  className?: string
}

// One shared, renderer-level gate for every model-dependent surface. The send path itself is already
// blocked when no model is selectable; this card explains what to do and opens Settings → Model.
const NoProviderNotice = ({ className }: NoProviderNoticeProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const hasUsableModel = useSettingsStore(selectHasUsableModel)
  const openSettingsToPanel = useSettingsStore((state) => state.openSettingsToPanel)
  if (hasUsableModel) return null

  return (
    <div
      role="status"
      data-testid="no-provider-notice"
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-status-warning-foreground/40 bg-status-warning-surface p-4 text-sm sm:flex-row sm:items-center',
        className
      )}
    >
      <AlertTriangle
        className="size-5 shrink-0 text-status-warning-foreground"
        strokeWidth={2}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-text-000">
          {t('AI service is not configured. Register an API key in Settings > Model.')}
        </p>
      </div>
      <Button type="button" variant="outline" onClick={() => openSettingsToPanel('model')}>
        {t('Open Settings > Model')}
      </Button>
    </div>
  )
}

export { NoProviderNotice }
