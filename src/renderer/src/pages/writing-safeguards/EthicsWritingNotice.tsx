import { ethicsWritingReminder } from '../../../../shared/writing-safeguards/ethics-approval'
import { writingSafeguardsCopy } from './copy'

export const EthicsWritingNotice = ({
  open,
  approvalNumber = ''
}: {
  open: boolean
  approvalNumber?: string
}): React.JSX.Element | null => {
  const copy = writingSafeguardsCopy('ja')
  const reminder = ethicsWritingReminder(approvalNumber)
  if (!open || !reminder.show) return null
  return (
    <p
      role="status"
      data-ethics-writing-reminder
      className="mt-3 rounded-xl border border-[#e4ded2] bg-[#faf8f2] px-3.5 py-3 text-xs leading-5 text-[#635f56]"
    >
      {reminder.message}
      <span className="sr-only">{copy.ethicsLabel}</span>
    </p>
  )
}
