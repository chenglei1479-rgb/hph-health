// @vitest-environment jsdom
import { act, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { strFromU8, unzipSync } from 'fflate'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { initI18n } from '../../i18n'
import { StatisticianReviewExportDialog } from './StatisticianReviewExportDialog'
import { getPackDeliveryLedger, resetPackDeliveryLedgerForTests } from './pack-delivery-ledger'
import type {
  StatisticianReviewExportFile,
  StatisticianReviewExportRequest,
  StatisticianReviewExportResponse
} from '../../../../shared/statistician-review-export'

afterEach(() => initI18n('en'))

beforeEach(() => {
  resetPackDeliveryLedgerForTests()
})

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

const allFiveFiles = (): StatisticianReviewExportFile[] => [
  {
    kind: 'statistical-report',
    filename: 'statistical-report.docx',
    mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    text: 'report',
    base64: btoa('report')
  },
  {
    kind: 'result-tables',
    filename: 'result-tables.csv',
    mediaType: 'text/csv',
    text: 'group,n',
    base64: btoa('group,n')
  },
  {
    kind: 'analysis-script',
    filename: 'analysis-script.R',
    mediaType: 'text/x-r-source',
    text: 'mean_diff <- 1.4',
    base64: btoa('mean_diff <- 1.4')
  },
  {
    kind: 'variable-definition',
    filename: 'variable-definition.csv',
    mediaType: 'text/csv',
    text: 'age',
    base64: btoa('age')
  },
  {
    kind: 'execution-log',
    filename: 'execution-log.txt',
    mediaType: 'text/plain',
    text: 'R 4.4.1',
    base64: btoa('R 4.4.1')
  }
]

type SavePackage = NonNullable<
  ComponentProps<typeof StatisticianReviewExportDialog>['onSavePackage']
>

type Mounted = {
  host: HTMLDivElement
  root: ReturnType<typeof createRoot>
  onExport: ReturnType<typeof vi.fn>
  onSavePackage: ReturnType<typeof vi.fn>
  unmount: () => Promise<void>
}

const mountDialog = async (options?: {
  files?: StatisticianReviewExportFile[]
  save?: SavePackage
}): Promise<Mounted> => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const onExport = vi.fn(
    async (
      _request: StatisticianReviewExportRequest
    ): Promise<StatisticianReviewExportResponse> => ({
      ok: true as const,
      files: options?.files ?? allFiveFiles()
    })
  )
  const onSavePackage = vi.fn(options?.save ?? (async () => ({ saved: true })))
  await act(async () => {
    root.render(
      <StatisticianReviewExportDialog
        open
        projectId="consultation-pack"
        onClose={() => undefined}
        onExport={onExport}
        onSavePackage={onSavePackage}
      />
    )
  })
  return {
    host,
    root,
    onExport,
    onSavePackage,
    unmount: async () => {
      await act(async () => root.unmount())
      host.remove()
    }
  }
}

const fillForm = (): void => {
  setControl('statistician-report-title', 'Report')
  setControl('statistician-report-body', 'Mean difference 1.4')
  setControl('statistician-result-table', 'group\tn\tmean\ntreatment\t7\t12.4')
  setControl('statistician-script-source', 'mean_diff <- 1.4')
  setControl('statistician-variable-definition', 'age\tAge in years\tnumber\tyears')
  setControl('statistician-execution-log', 'R 4.4.1')
}

const clickExport = async (): Promise<void> => {
  await act(async () => {
    document.body
      .querySelector<HTMLButtonElement>('[data-testid="statistician-review-export"]')
      ?.click()
  })
}

const statusText = (): string =>
  document.body.querySelector('[data-testid="statistician-export-status"]')?.textContent ?? ''

it('exports one zip package with the five original files and a manifest', async () => {
  initI18n('en')
  const mounted = await mountDialog()
  try {
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
    fillForm()
    await clickExport()

    expect(mounted.onExport).toHaveBeenCalledOnce()
    const request = mounted.onExport.mock.calls[0]?.[0] as StatisticianReviewExportRequest
    expect(request).not.toHaveProperty('rawData')
    expect(request).not.toHaveProperty('notebookOutput')
    expect(request).not.toHaveProperty('chatHistory')
    expect(request.resultTables.sheets[0]?.rows[0]?.[1]).toBe(7)

    // One Save As for the whole package: no per-file dialogs, no ignored cancellations.
    expect(mounted.onSavePackage).toHaveBeenCalledOnce()
    const saved = mounted.onSavePackage.mock.calls[0]?.[0] as {
      filename: string
      mediaType: string
      data: ArrayBuffer
    }
    expect(saved.mediaType).toBe('application/zip')
    expect(saved.filename).toMatch(/^statistician-package-.*\.zip$/u)

    const entries = unzipSync(new Uint8Array(saved.data))
    expect(Object.keys(entries).sort()).toEqual(
      [
        'analysis-script.R',
        'execution-log.txt',
        'manifest.txt',
        'result-tables.csv',
        'statistical-report.docx',
        'variable-definition.csv'
      ].sort()
    )
    const manifest = strFromU8(entries['manifest.txt']!)
    expect(manifest).toContain('generated:')
    expect(manifest).toContain('statistical-report.docx')
    expect(manifest).toContain('execution-log.txt')

    expect(statusText()).toContain('Statistician package exported.')
    expect(getPackDeliveryLedger().totalCompleted).toBe(1)
  } finally {
    await mounted.unmount()
  }
})

it('treats cancelling the single save dialog as a normal path and records nothing', async () => {
  initI18n('en')
  const mounted = await mountDialog({ save: async () => ({ saved: false }) })
  try {
    fillForm()
    await clickExport()

    expect(mounted.onSavePackage).toHaveBeenCalledOnce()
    expect(statusText()).toBe('')
    expect(document.body.textContent).not.toContain('Statistician package exported.')
    expect(statusText()).not.toContain('WIN-EXPORT')
    expect(getPackDeliveryLedger().totalCompleted).toBe(0)
    expect(getPackDeliveryLedger().recordedKeys).toHaveLength(0)
  } finally {
    await mounted.unmount()
  }
})

it('reports the resource diagnostic when a bundled export resource is missing', async () => {
  initI18n('en')
  const mounted = await mountDialog({
    save: async () => {
      throw Object.assign(new Error('ENOENT: no such file or directory, open font.otf'), {
        name: 'Error'
      })
    }
  })
  try {
    fillForm()
    await clickExport()

    expect(statusText()).toContain('WIN-EXPORT-01')
    expect(statusText()).toContain('Check the destination folder and retry')
    expect(getPackDeliveryLedger().totalCompleted).toBe(0)
  } finally {
    await mounted.unmount()
  }
})

it('reports the write diagnostic when the package cannot be written to the destination', async () => {
  initI18n('en')
  const mounted = await mountDialog({
    save: async () => {
      throw Object.assign(new Error('EACCES: permission denied, open target'), {
        name: 'Error'
      })
    }
  })
  try {
    fillForm()
    await clickExport()

    expect(statusText()).toContain('WIN-EXPORT-02')
    expect(statusText()).toContain('Check the destination folder and retry')
    expect(getPackDeliveryLedger().totalCompleted).toBe(0)
  } finally {
    await mounted.unmount()
  }
})
