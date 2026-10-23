import './baselio-logo-motion.css'
import markSvg from '@/assets/baselio-mark.svg?raw'

import { cn } from '@/lib/utils'

type AppLogoProps = {
  className?: string
  alt?: string
  interactive?: boolean
  busy?: boolean
}

// Traced once from design/brand/baselio-logo-final.png. Fill is the sampled green.
const AppLogo = ({
  className,
  alt = '',
  interactive = false,
  busy = false
}: AppLogoProps): React.JSX.Element => {
  return (
    <span
      className={cn(
        'baselio-mark',
        interactive && 'baselio-logo-interactive',
        busy && 'baselio-logo-busy',
        className
      )}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      dangerouslySetInnerHTML={{ __html: markSvg }}
    />
  )
}

export { AppLogo }
export type { AppLogoProps }
