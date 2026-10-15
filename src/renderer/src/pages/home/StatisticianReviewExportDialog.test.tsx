// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'

import { initI18n } from '../../i18n'
import { StatisticianReviewExportDialog } from './StatisticianReviewExportDialog'
import type { StatisticianReviewExportRequest } from '../../../../shared/statistician-review-export'

afterEach(() => initI18n('en'))

const setControl = (testId: string, value: string): void => {
  const element = document.body.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[data-testid="${testId}"]`
  )
  if (!element) throw new Error(`Missing ${testId}`)
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

it('exports only aggregate statistician files and keeps real counts', async () => {
  initI18n('en')
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const onExport = vi.fn(async (request: StatisticianReviewExportRequest) => {
    expect(request).not.toHaveProperty('rawData')
    expect(request).not.toHaveProperty('notebookOutput')
    expect(request).not.toHaveProperty('chatHistory')
    expect(request.resultTables.sheets[0]?.rows[0]?.[1]).toBe(7)
    return {
      ok: true as const,
      files: [
        {
          kind: 'statistical-report' as const,
          filename: 'statistical-report.docx',
          mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          text: 'report',
          base64: btoa('report')
        }
      ]
    }
  })
  const onSaveFile = vi.fn<
    (file: { filename: string; mediaType: string; data: ArrayBuffer }) => Promise<void>
  >(async () => undefined)
  try {
    await act(async () => {
      root.render(
        <StatisticianReviewExportDialog
          open
          projectId="consultation-pack"
          onClose={() => undefined}
          onExport={onExport}
          onSaveFile={onSaveFile}
        />
      )
    })
    expect(document.body.querySelector('[data-testid="export-raw-data"]')).toBeNull()
    expect(document.body.querySelector('[data-testid="export-notebook"]')).toBeNull()
    expect(document.body.querySelector('[data-testid="export-chat"]')).toBeNull()
    expect(document.body.querySelectorAll('input[type="checkbox"]')).toHaveLength(0)
    expect(document.body.querySelector('input[type="file"]')).toBeNull()
    expect(document.body.textContent).toContain(
      'Aggregated results only; source data is not included'
    )
    expect(document.body.textContent).not.toContain('個体データ')
    expect(document.body.textContent).toContain('Statistical report')
    expect(document.body.textContent).toContain('Result tables')
    expect(document.body.textContent).toContain('Analysis script')
    expect(document.body.textContent).toContain('Variable definition table')
    expect(document.body.textContent).toContain('Execution log')
    expect(document.body.textContent).toContain('not masked')
    setControl('statistician-report-title', 'Report')
    setControl('statistician-report-body', 'Mean difference 1.4')
    setControl('statistician-result-table', 'group\tn\tmean\ntreatment\t7\t12.4')
    setControl('statistician-script-source', 'mean_diff <- 1.4')
    setControl('statistician-variable-definition', 'age\tAge in years\tnumber\tyears')
    setControl('statistician-execution-log', 'R 4.4.1')
    await act(async () => {
      document.body
        .querySelector<HTMLButtonElement>('[data-testid="statistician-review-export"]')
        ?.click()
    })
    expect(onExport).toHaveBeenCalledOnce()
    expect(onSaveFile).toHaveBeenCalledOnce()
    expect(onSaveFile.mock.calls[0]?.[0].filename).toBe('statistical-report.docx')
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
