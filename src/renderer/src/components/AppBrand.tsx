import { useTranslation } from 'react-i18next'

import { APP } from '../../../shared/app-config'
import { cn } from '@/lib/utils'
import { AppLogo } from './AppLogo'

type AppBrandProps = {
  className?: string
  showLogo?: boolean
}

// Keep the English brand signature consistent with the website in every locale.
export const AppBrand = ({ className, showLogo = true }: AppBrandProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <span
      className={cn('dra-app-brand', className)}
      aria-label={`${APP.brand.name} ${t('AI Research Infrastructure for Medicine')}`}
    >
      {showLogo ? <AppLogo className="dra-app-brand-logo" /> : null}
      <span className="dra-app-brand-name" aria-hidden="true">
        {APP.brand.name}
      </span>
      <span className="dra-app-brand-tagline" lang="en" aria-hidden="true">
        {APP.brand.taglineLines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </span>
    </span>
  )
}
