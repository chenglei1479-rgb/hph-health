import { isDraPrerelease, PRERELEASE_BANNER_TEXT } from '../../../shared/prerelease'

// Fixed so onboarding, the login skip, and full-page startup states all keep the warning visible.
// The sentence stays in Japanese on every locale; it is the internal-beta safety line, not a translation.
export const PrereleaseBanner = (): React.JSX.Element | null => {
  if (!isDraPrerelease()) return null
  return (
    <div
      role="status"
      data-testid="prerelease-banner"
      className="fixed inset-x-0 top-(--windows-titlebar-height) z-30 border-b border-status-warning-foreground/30 bg-status-warning-surface px-4 py-1.5 text-center text-sm font-medium text-status-warning-foreground dark:border-status-warning-dark-foreground/30 dark:bg-status-warning-dark-surface dark:text-status-warning-dark-foreground"
    >
      {PRERELEASE_BANNER_TEXT}
    </div>
  )
}
