import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useNavigationStore } from '@/stores/navigation-store'
import { useProjectStore } from '@/stores/project-store'
import {
  deliveredPackId,
  nextStepAfter,
  type DeliveryMessage
} from '../../../../shared/deliverable-next-step'
import { EthicsWritingNotice } from '@/pages/writing-safeguards/EthicsWritingNotice'
import { offersAggregateStatisticsExport } from './aggregate-export-offer'
import { PackNextStepCard } from './PackNextStepCard'
import { recordPackDelivery } from './pack-delivery-ledger'
import { StatisticianReviewExportDialog } from './StatisticianReviewExportDialog'
import { buildResearchFollowUpPrompt } from './research-follow-up'

type DeliverableSession = {
  id: string
  status: string
  projectId: string
  contentLoaded?: false | boolean
  messages: DeliveryMessage[]
}

export const DeliverableNextStepHost = ({
  session
}: {
  session?: DeliverableSession
}): React.JSX.Element | null => {
  const { t } = useTranslation()
  const agentContext = useProjectStore((state) =>
    session
      ? state.projects.find((project) => project.id === session.projectId)?.agentContext
      : undefined
  )
  const projectName = useProjectStore((state) =>
    session ? state.projects.find((project) => project.id === session.projectId)?.name : undefined
  )
  const startResearchConversation = useNavigationStore((state) => state.startResearchConversation)
  const completionId = session
    ? deliveredPackId({
        status: session.status,
        contentLoaded: session.contentLoaded,
        agentContext,
        messages: session.messages
      })
    : null
  const nextStep = completionId ? nextStepAfter(completionId) : null
  const [approval, setApproval] = useState<{ projectId: string; number: string } | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const sessionId = session?.id
  const projectId = session?.projectId
  const showExport = offersAggregateStatisticsExport({
    agentContext,
    messages: session?.messages,
    completionId
  })

  useEffect(() => {
    if (!sessionId || !completionId) return
    recordPackDelivery(completionId, `session:${sessionId}`)
  }, [completionId, sessionId])

  useEffect(() => {
    if (!projectId || nextStep?.id !== 'writing-pack') return
    let cancelled = false
    const api = window.api?.writingSafeguards
    const pending = api
      ? api.getEthicsApproval({ projectId })
      : Promise.resolve({ approvalNumber: '' })
    void pending
      .then((record) => {
        if (!cancelled) setApproval({ projectId, number: record.approvalNumber })
      })
      .catch(() => {
        if (!cancelled) setApproval({ projectId, number: '' })
      })
    return () => {
      cancelled = true
    }
  }, [nextStep?.id, projectId])

  if (!session || !projectId || (!completionId && !showExport)) return null
  return (
    <div className="mb-3 px-2 md:px-4" data-testid="deliverable-next-step-host">
      {completionId ? (
        <PackNextStepCard
          completionId={completionId}
          onContinue={() => {
            if (!nextStep || nextStep.kind !== 'available') return
            const prompt = buildResearchFollowUpPrompt(
              t,
              nextStep.id,
              projectName?.trim() || t('Research theme')
            )
            startResearchConversation(projectId, prompt)
          }}
        />
      ) : null}
      {showExport ? (
        <div className="mt-3">
          <button
            type="button"
            data-testid="export-statistician-package"
            className="rounded-xl border border-[#d5dfdc] bg-white px-3 py-2 text-left text-sm font-medium text-[#20343a]"
            onClick={() => setExportOpen(true)}
          >
            {t('Aggregate statistics export')}
          </button>
          <p
            data-testid="statistician-export-subtitle"
            className="mt-1 text-xs leading-5 text-[#635f56]"
          >
            {t('Aggregated results only; source data is not included')}
          </p>
        </div>
      ) : null}
      {projectId ? (
        <StatisticianReviewExportDialog
          open={exportOpen && showExport}
          projectId={projectId}
          onClose={() => setExportOpen(false)}
        />
      ) : null}
      {nextStep?.id === 'writing-pack' && approval?.projectId === projectId ? (
        <EthicsWritingNotice open approvalNumber={approval.number} />
      ) : null}
    </div>
  )
}
