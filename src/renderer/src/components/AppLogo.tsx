import markSvg from '@/assets/baselio-mark.svg?raw'

import { cn } from '@/lib/utils'

type AppLogoProps = {
  className?: string
  alt?: string
}

// Traced from the approved Baselio reference. currentColor follows the theme primary.
const AppLogo = ({ className, alt = '' }: AppLogoProps): React.JSX.Element => {
  return (
    <span
      className={cn('baselio-mark', className)}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      dangerouslySetInnerHTML={{ __html: markSvg }}
    />
  )
}

export { AppLogo }
export type { AppLogoProps }
