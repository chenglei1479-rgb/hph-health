import { isDraPrerelease, PRERELEASE_DATA_DESTINATION_NOTICE } from '../../../shared/prerelease'

type Props = {
  id?: string
  testId?: string
}

// Persistent fictional-data warning. The sentence stays Japanese on every locale.
export const PrereleaseDataDestinationNotice = ({
  id = 'prerelease-data-destination',
  testId = 'prerelease-data-destination'
}: Props): React.JSX.Element | null => {
  if (!isDraPrerelease()) return null
  return (
    <p
      id={id}
      role="note"
      data-testid={testId}
      className="text-xs leading-5 text-status-warning-foreground dark:text-status-warning-dark-foreground"
    >
      {PRERELEASE_DATA_DESTINATION_NOTICE}
    </p>
  )
}
