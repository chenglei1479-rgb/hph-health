import horizontalSvg from '@/assets/baselio-horizontal.svg?raw'
import './baselio-splash.css'

// Keep the existing component and test id for startup/recovery surface continuity.
const OpenScienceLogoLoader = (): React.JSX.Element => (
  <div
    data-testid="open-science-logo-loader"
    className="baselio-splash-mark pointer-events-none w-56 shrink-0"
    aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: horizontalSvg }}
  />
)

export { OpenScienceLogoLoader }
