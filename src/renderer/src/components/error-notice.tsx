import { Notice, type NoticeProps, type NoticeButtonProps } from './notice'
import type { ErrorNoticeTone, NoticeLevel } from './ui/notice-chrome'
import { useTranslation } from 'react-i18next'
import { membershipRequirement } from '../../../shared/membership'

// Preserve the existing public error API while all surfaces use the same Notice renderer.
type ErrorNoticeProps = NoticeProps & { tone?: ErrorNoticeTone }
const levels: Record<ErrorNoticeTone, NoticeLevel> = {
  teal: 'info',
  amber: 'warning',
  red: 'error'
}
const ErrorNotice = ({ tone = 'amber', level, ...props }: ErrorNoticeProps): React.JSX.Element => {
  const { t } = useTranslation()
  const formatMembership = (value: unknown): unknown => {
    if (typeof value !== 'string') return value
    const plan = membershipRequirement(value)
    return plan
      ? t(
          '{{plan}} membership is required for this feature. Open Account > Membership and plans.',
          { plan: plan === 'plus' ? 'Plus' : 'Pro' }
        )
      : value
  }
  return (
    <Notice
      {...props}
      title={formatMembership(props.title) as ErrorNoticeProps['title']}
      description={formatMembership(props.description) as ErrorNoticeProps['description']}
      level={level ?? levels[tone]}
    />
  )
}

export { ErrorNotice }
export type { ErrorNoticeProps, NoticeButtonProps as ErrorNoticeButton, ErrorNoticeTone }
