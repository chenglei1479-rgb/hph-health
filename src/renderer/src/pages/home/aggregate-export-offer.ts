import { CONSULTATION_PACK_MODE_LINE } from '../../../../shared/deliverable-pack-policy'
import {
  WORKFLOW_MODE_ANALYSIS_LINE,
  type DeliveryPackId
} from '../../../../shared/deliverable-next-step'

const EXPORT_FLOW_IDS = new Set<DeliveryPackId>([
  'analysis',
  'consultation-pack',
  'statistician-export'
])

// Aggregate statistics export lives in the analysis and consultation flows, not on the home screen.
export const offersAggregateStatisticsExport = (input: {
  agentContext?: string | null
  messages?: readonly { content: string }[]
  completionId?: DeliveryPackId | null
}): boolean => {
  if (input.completionId && EXPORT_FLOW_IDS.has(input.completionId)) return true
  const text = [
    input.agentContext ?? '',
    ...(input.messages ?? []).map((message) => message.content)
  ].join('\n')
  return text.includes(WORKFLOW_MODE_ANALYSIS_LINE) || text.includes(CONSULTATION_PACK_MODE_LINE)
}
