import { useTranslation } from 'react-i18next'

import {
  isDraPrerelease,
  PRERELEASE_DATA_DESTINATION_NOTICE,
  PRERELEASE_DATA_USE_NOTICE
} from '../../../shared/prerelease'

type Props = {
  id?: string
  testId?: string
}

// Persistent fictional-data warning. The canonical wording lives in every translated catalog, so a
// beta build shows it in the active language instead of a fixed Japanese sentence.
export const PrereleaseDataDestinationNotice = ({
  id = 'prerelease-data-destination',
  testId = 'prerelease-data-destination'
}: Props): React.JSX.Element | null => {
  const { t } = useTranslation()
  if (!isDraPrerelease()) return null
  return (
    <p
      id={id}
      role="note"
      data-testid={testId}
      className="text-xs leading-5 text-status-warning-foreground dark:text-status-warning-dark-foreground"
    >
      {t(PRERELEASE_DATA_DESTINATION_NOTICE)} {t(PRERELEASE_DATA_USE_NOTICE)}
    </p>
  )
}
