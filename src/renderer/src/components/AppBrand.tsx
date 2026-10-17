import { APP } from '../../../shared/app-config'
import { cn } from '@/lib/utils'
import { AppLogo } from './AppLogo'

type AppBrandProps = {
  className?: string
  showLogo?: boolean
  productName?: string
}

export const AppBrand = ({
  className,
  showLogo = true,
  productName = APP.brand.name
}: AppBrandProps): React.JSX.Element => {
  return (
    <span className={cn('dra-app-brand', className)} aria-label={productName}>
      {showLogo ? <AppLogo className="dra-app-brand-logo" /> : null}
      <span className="dra-app-brand-name" aria-hidden="true">
        {productName}
      </span>
    </span>
  )
}
