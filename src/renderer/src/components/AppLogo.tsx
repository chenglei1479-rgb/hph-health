import type { ComponentPropsWithoutRef } from 'react'

import medicalResearchMarkUrl from '@/assets/medical-research-mark.svg'

type AppLogoProps = Omit<ComponentPropsWithoutRef<'img'>, 'src'>

// The single renderer-facing MedResearch Agent mark. The rising sun and wave lines carry a quiet
// Japanese reference while keeping the app mark legible in both light and dark themes.
const AppLogo = ({ alt = '', ...props }: AppLogoProps): React.JSX.Element => {
  return <img {...props} src={medicalResearchMarkUrl} alt={alt} />
}

export { AppLogo }
export type { AppLogoProps }
