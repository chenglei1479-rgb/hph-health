import { expect, it } from 'vitest'

import { CONSULTATION_PACK_MODE_LINE } from '../../../../shared/deliverable-pack-policy'
import { WORKFLOW_MODE_ANALYSIS_LINE } from '../../../../shared/deliverable-next-step'
import { offersAggregateStatisticsExport } from './aggregate-export-offer'

it('offers aggregate export from analysis and consultation, not from the mentor or writing packs', () => {
  expect(offersAggregateStatisticsExport({ agentContext: WORKFLOW_MODE_ANALYSIS_LINE })).toBe(true)
  expect(
    offersAggregateStatisticsExport({
      messages: [{ content: `notes\n${CONSULTATION_PACK_MODE_LINE}` }]
    })
  ).toBe(true)
  expect(offersAggregateStatisticsExport({ completionId: 'statistician-export' })).toBe(true)
  expect(offersAggregateStatisticsExport({ agentContext: 'Package mode: mentor-pack' })).toBe(false)
  expect(offersAggregateStatisticsExport({ agentContext: 'Package mode: writing-pack' })).toBe(
    false
  )
  expect(offersAggregateStatisticsExport({ completionId: 'writing-pack' })).toBe(false)
})
