import { useTranslation } from 'react-i18next'

import { APP } from '../../../shared/app-config'
import { cn } from '@/lib/utils'
import { AppLogo } from './AppLogo'

type AppBrandProps = {
  className?: string
  showLogo?: boolean
  productName?: string
}

// Keep the English brand signature consistent with the website in every locale.
export const AppBrand = ({
  className,
  showLogo = true,
  productName = APP.brand.name
}: AppBrandProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <span
      className={cn('dra-app-brand', className)}
      aria-label={`${productName} ${t('AI Research Infrastructure for Medicine')}`}
    >
      {showLogo ? <AppLogo className="dra-app-brand-logo" /> : null}
      <span className="dra-app-brand-name" aria-hidden="true">
        {productName}
      </span>
      <span className="dra-app-brand-tagline" aria-hidden="true">
        {t('AI Research Infrastructure for Medicine')}
      </span>
    </span>
  )
}
