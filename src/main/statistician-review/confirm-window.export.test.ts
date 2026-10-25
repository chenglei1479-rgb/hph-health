import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StatisticianReviewExportRequest } from '../../shared/statistician-review-export'
import { englishNativeTranslator } from '../locale/main-process-messages'
import type { PhiConfirmDecision, PhiConfirmLabels, PhiPreview } from '../phi/confirm'
import { createStatisticianExportConfirmer } from './confirm-window'
import { exportStatisticianReviewPackage } from './export'

type ReviewPhi = (
  preview: PhiPreview,
  labels: PhiConfirmLabels,
  callerId?: string,
  signal?: AbortSignal
) => Promise<PhiConfirmDecision>

const state = vi.hoisted(() => ({
  review: undefined as ReviewPhi | undefined
}))

// Partial mock: only the privacy-review bridge is replaced, so the rest of the desktop interaction
// contract stays real and the export reaches the genuine document builders.
vi.mock('../desktop-interaction', async (original) => ({
  ...(await original<typeof import('../desktop-interaction')>()),
  desktopFileInteraction: () => ({ reviewPhi: state.review })
}))

const confirmer = (): ReturnType<typeof createStatisticianExportConfirmer> =>
  createStatisticianExportConfirmer(englishNativeTranslator)

const aggregate = (): StatisticianReviewExportRequest => ({
  projectId: 'consultation-pack',
  statisticalReport: {
    format: 'docx',
    title: '統計報告',
    body: 'Mean difference 1.4. 研究期間：2020-01-01 to 2024-12-31.'
  },
  resultTables: {
    sheets: [
      {
        name: 'results',
        columns: ['group', 'n', 'mean'],
        rows: [
          ['treatment', 7, 12.4],
          ['control', 9, 11.1]
        ]
      }
    ]
  },
  analysisScript: { language: 'r', source: 'mean_diff <- 1.4\nn_treatment <- 7\n' },
  variableDefinition: {
    rows: [{ name: 'age', definition: 'Age in years', type: 'number', coding: 'years' }]
  },
  executionLog: { text: 'R 4.4.1\nmean_diff = 1.4\n研究期間：2020-01-01' }
})

afterEach(() => {
  state.review = undefined
  vi.restoreAllMocks()
})

describe('statistician export through the native review', () => {
  it('writes the five aggregate files only after the doctor confirms', async () => {
    const review = vi.fn<ReviewPhi>(async () => ({ confirmed: true }))
    state.review = review

    const result = await exportStatisticianReviewPackage(aggregate(), { confirm: confirmer() })

    expect(review).toHaveBeenCalledOnce()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.files.map((file) => file.filename)).toEqual([
      'statistical-report.docx',
      'result-tables.xlsx',
      'analysis.R',
      'variable-definition.pdf',
      'execution-log.pdf'
    ])
    const [sentPreview] = review.mock.calls[0]
    expect(sentPreview.text).toContain('2020-01-01')
  })

  it('exports nothing when the doctor cancels the native review', async () => {
    state.review = vi.fn<ReviewPhi>(async () => ({ confirmed: false }))

    await expect(
      exportStatisticianReviewPackage(aggregate(), { confirm: confirmer() })
    ).resolves.toEqual({ ok: false, code: 'not-confirmed' })
  })

  it('keeps the not-confirmed contract and logs a missing review bridge', async () => {
    state.review = undefined
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(
      exportStatisticianReviewPackage(aggregate(), { confirm: confirmer() })
    ).resolves.toEqual({ ok: false, code: 'not-confirmed' })

    expect(logged).toHaveBeenCalledOnce()
    expect(String(logged.mock.calls[0]?.[0])).toContain('[statistician-export]')
  })
})
