import { useLocaleStore } from '@/stores/locale-store'

import { isDraPrerelease, prereleaseBannerText } from '../../../shared/prerelease'

// Fixed so onboarding, the login skip, and full-page startup states all keep the warning visible.
// The sentence follows the UI language. The warning itself stays on every prerelease build.
export const PrereleaseBanner = (): React.JSX.Element | null => {
  const locale = useLocaleStore((state) => state.locale)
  if (!isDraPrerelease()) return null
  return (
    <div
      role="status"
      data-testid="prerelease-banner"
      className="fixed inset-x-0 top-(--windows-titlebar-height) z-30 border-b border-status-warning-foreground/30 bg-status-warning-surface px-4 py-1.5 text-center text-sm font-medium text-status-warning-foreground dark:border-status-warning-dark-foreground/30 dark:bg-status-warning-dark-surface dark:text-status-warning-dark-foreground"
    >
      {prereleaseBannerText(locale)}
    </div>
  )
}
