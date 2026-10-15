import { useTranslation } from 'react-i18next'

import { useNavigationStore } from '@/stores/navigation-store'
import { useProjectStore } from '@/stores/project-store'
import { isMentorDiscussionPack } from '../../../../shared/deliverable-pack-policy'
import { deliverableCardCopy } from './deliverable-packages'

export const MentorPackComposerNotice = ({
  sessionProjectId
}: {
  sessionProjectId?: string
}): React.JSX.Element | null => {
  const { t } = useTranslation()
  const navigationProjectId = useNavigationStore((state) => state.activeProjectId)
  const projectId = sessionProjectId || navigationProjectId
  const agentContext = useProjectStore((state) =>
    projectId ? state.projects.find((project) => project.id === projectId)?.agentContext : undefined
  )
  if (!isMentorDiscussionPack(agentContext)) return null
  const copy = deliverableCardCopy(t)['mentor-pack']
  return (
    <div
      data-testid="mentor-pack-input-notice"
      className="mb-2 space-y-1 rounded-xl border border-[#e4ded2] bg-[#faf8f2] px-3.5 py-3 text-xs leading-5 text-[#635f56]"
    >
      <p className="font-medium text-[#9a5046]">{copy.hardRule}</p>
      <p>{copy.inputNotice}</p>
    </div>
  )
}
