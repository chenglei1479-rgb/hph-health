import type { TFunction } from 'i18next'

// Closed-state copy for downloads that a build has intentionally disabled. These strings are
// translated in all eight locales; the guard suite rejects missing catalog entries.
export const skillMarketplaceDisabledText = (t: TFunction): string =>
  t("The skill marketplace isn't available right now. Skills you've already installed still work.")

export const specialistMarketplaceDisabledText = (t: TFunction): string =>
  t(
    "The specialist marketplace isn't available right now. Specialists you've already added still work."
  )

export const windowsRuntimeDownloadDisabledText = (t: TFunction): string =>
  t(
    "This version can't download the Windows notebook runtime. Watch for an update from the distributor."
  )
