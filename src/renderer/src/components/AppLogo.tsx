import type { ComponentPropsWithoutRef } from 'react'

import logoDarkUrl from '@/assets/logo-dark.png'
import logoLightUrl from '@/assets/logo.png'
import { cn } from '@/lib/utils'

type AppLogoProps = Omit<ComponentPropsWithoutRef<'img'>, 'src'>

// Both theme variants share the same dotted-ring mark as the native app icons.
const AppLogo = ({ alt = '', className, ...props }: AppLogoProps): React.JSX.Element => {
  return (
    <>
      <img {...props} className={cn(className, 'dark:hidden')} src={logoLightUrl} alt={alt} />
      <img {...props} className={cn(className, 'hidden dark:block')} src={logoDarkUrl} alt={alt} />
    </>
  )
}

export { AppLogo }
export type { AppLogoProps }
