import { APP } from '../../../shared/app-config'
import { cn } from '@/lib/utils'
import horizontalSvg from '@/assets/baselio-horizontal.svg?raw'

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
      {showLogo ? (
        <span
          className="baselio-horizontal"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: horizontalSvg }}
        />
      ) : (
        <span className="dra-app-brand-name" aria-hidden="true">
          {productName}
        </span>
      )}
    </span>
  )
}
