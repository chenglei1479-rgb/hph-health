import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import * as Dialog from '@/components/ui/dialog'
import {
  dialogCloseButtonClassName,
  dialogFormHelpClassName,
  dialogFormLabelClassName,
  dialogFormTextareaClassName,
  dialogOverlayClassName,
  dialogPanelClassName
} from '@/components/ui/dialog-chrome'
import { recordPackDelivery } from './pack-delivery-ledger'
import { classifyStatisticianExportFailure } from '../../../../shared/statistician-export-diagnostics'
import {
  parseResultTableTsv,
  parseVariableDefinitionTsv,
  type StatisticianExportCode,
  type StatisticianReportFormat,
  type StatisticianReviewExportRequest,
  type StatisticianReviewExportResponse,
  type StatisticianScriptLanguage
} from '../../../../shared/statistician-review-export'
import { strToU8, zipSync } from 'fflate'

type StatisticianReviewExportDialogProps = {
  open: boolean
  projectId: string
  onClose: () => void
  onExport?: (request: StatisticianReviewExportRequest) => Promise<StatisticianReviewExportResponse>
  onSavePackage?: (pkg: {
    filename: string
    mediaType: string
    data: ArrayBuffer
  }) => Promise<{ saved: boolean }>
}

const EXPORT_MANIFEST_NAME = 'manifest.txt'

const bytesFromBase64 = (value: string): Uint8Array => {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

// One archive for one Save As. The five aggregate files keep their original names; the manifest lets
// the doctor confirm what the package contains without opening every file.
const buildExportPackage = (
  files: ReadonlyArray<{ filename: string; mediaType: string; base64: string }>,
  generatedAt: string
): Uint8Array => {
  const entries: Record<string, Uint8Array> = {}
  for (const file of files) entries[file.filename] = bytesFromBase64(file.base64)
  entries[EXPORT_MANIFEST_NAME] = strToU8(
    [
      'Statistician package',
      `generated: ${generatedAt}`,
      'files:',
      ...files.map((file) => `- ${file.filename}\t${file.mediaType}`)
    ].join('\n')
  )
  return zipSync(entries, { level: 6 })
}

const packageFilename = (generatedAt: string): string =>
  `statistician-package-${generatedAt.replace(/[:.]/gu, '-').replace(/T/u, '_').slice(0, 19)}.zip`

const StatisticianReviewExportDialog = ({
  open,
  projectId,
  onClose,
  onExport,
  onSavePackage
}: StatisticianReviewExportDialogProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [format, setFormat] = useState<StatisticianReportFormat>('docx')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [table, setTable] = useState('')
  const [language, setLanguage] = useState<StatisticianScriptLanguage>('r')
  const [source, setSource] = useState('')
  const [definition, setDefinition] = useState('')
  const [log, setLog] = useState('')
  const [status, setStatus] = useState<string | undefined>()
  const [pending, setPending] = useState(false)

  const messageFor = (code: StatisticianExportCode): string => {
    if (code === 'small-cell-mask') {
      return t(
        'Result tables keep real counts for the research team. Remove the <10 mask and export the actual number.'
      )
    }
    if (code === 'not-confirmed')
      return t('The doctor did not confirm this export. No files were saved.')
    if (code === 'deidentify-failed')
      return t('The de-identification check failed. Nothing was exported.')
    if (code === 'forbidden')
      return t('Beta does not export raw data, Notebook rows, or chat history.')
    return t('Enter the aggregate outputs before export.')
  }

  const exportPackage = async (): Promise<void> => {
    const sheets = parseResultTableTsv(table)
    const rows = parseVariableDefinitionTsv(definition)
    if (!title.trim() || !body.trim() || !source.trim() || !log.trim() || !sheets || !rows) {
      setStatus(t('Enter the aggregate outputs before export.'))
      return
    }
    setPending(true)
    setStatus(undefined)
    try {
      const send = onExport ?? window.api.statisticianReview.exportPackage
      const result = await send({
        projectId,
        statisticalReport: { format, title: title.trim(), body: body.trim() },
        resultTables: { sheets: [sheets] },
        analysisScript: { language, source: source.trim() },
        variableDefinition: { rows },
        executionLog: { text: log.trim() }
      })
      if (!result.ok) {
        setStatus(messageFor(result.code))
        return
      }
      const generatedAt = new Date().toISOString()
      const archive = buildExportPackage(result.files, generatedAt)
      const data = archive.buffer.slice(
        archive.byteOffset,
        archive.byteOffset + archive.byteLength
      ) as ArrayBuffer
      const savePackage: NonNullable<StatisticianReviewExportDialogProps['onSavePackage']> =
        onSavePackage ??
        ((pkg) =>
          window.api.saveBlobFile({
            suggestedName: pkg.filename,
            mimeType: pkg.mediaType,
            data: pkg.data
          }))
      const saved = await savePackage({
        filename: packageFilename(generatedAt),
        mediaType: 'application/zip',
        data
      })
      // Cancelling the single Save As dialog is a normal path: nothing was written, nothing is
      // recorded, and the doctor gets no error.
      if (saved?.saved !== true) {
        setStatus(undefined)
        return
      }
      recordPackDelivery('statistician-export', `export:${crypto.randomUUID()}`)
      setStatus(t('Statistician package exported.'))
    } catch (error) {
      setStatus(
        t(
          'The export package could not be written. Check the destination folder and retry; if it fails again, report this diagnostic: {{code}}',
          { code: classifyStatisticianExportFailure(error) }
        )
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={dialogOverlayClassName} />
        <Dialog.Content
          className={dialogPanelClassName(
            'flex max-h-[min(760px,calc(100svh-2rem))] w-[min(640px,calc(100vw-2rem))] flex-col overflow-hidden p-0'
          )}
          data-testid="statistician-export-dialog"
        >
          <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border-300/90 px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold text-text-000">
                {t('Aggregate statistics export')}
              </Dialog.Title>
              <p
                data-testid="statistician-export-subtitle"
                className="mt-1 text-sm font-medium text-text-000"
              >
                {t('Aggregated results only; source data is not included')}
              </p>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                {t(
                  'This does not run an analysis. It only exports the aggregate package for a statistician. Source data and chat history are not included.'
                )}
              </Dialog.Description>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('Close')}
              className={dialogCloseButtonClassName}
              disabled={pending}
              onClick={onClose}
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </header>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <p className={dialogFormHelpClassName}>
              {t('The doctor must confirm de-identification before these files are saved.')}
            </p>
            <section className="space-y-2">
              <h2 className={dialogFormLabelClassName}>{t('Statistical report')}</h2>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={format === 'docx' ? 'default' : 'outline'}
                  aria-pressed={format === 'docx'}
                  data-testid="statistician-report-format-docx"
                  onClick={() => setFormat('docx')}
                >
                  {t('Word')}
                </Button>
                <Button
                  type="button"
                  variant={format === 'pdf' ? 'default' : 'outline'}
                  aria-pressed={format === 'pdf'}
                  data-testid="statistician-report-format-pdf"
                  onClick={() => setFormat('pdf')}
                >
                  {t('PDF')}
                </Button>
              </div>
              <label className={dialogFormLabelClassName} htmlFor="statistician-report-title">
                {t('Report title')}
              </label>
              <input
                id="statistician-report-title"
                data-testid="statistician-report-title"
                className={dialogFormTextareaClassName}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <label className={dialogFormLabelClassName} htmlFor="statistician-report-body">
                {t('Report body')}
              </label>
              <textarea
                id="statistician-report-body"
                data-testid="statistician-report-body"
                className={dialogFormTextareaClassName}
                rows={4}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            </section>
            <section className="space-y-2">
              <h2 className={dialogFormLabelClassName}>{t('Result tables')}</h2>
              <p className={dialogFormHelpClassName}>
                {t('Real counts are kept. Cells under 10 are not masked.')}
              </p>
              <p className={dialogFormHelpClassName}>
                {t('Paste a tab-separated table. The first row is the header.')}
              </p>
              <textarea
                data-testid="statistician-result-table"
                className={dialogFormTextareaClassName}
                rows={4}
                value={table}
                onChange={(event) => setTable(event.target.value)}
              />
            </section>
            <section className="space-y-2">
              <h2 className={dialogFormLabelClassName}>{t('Analysis script')}</h2>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={language === 'r' ? 'default' : 'outline'}
                  aria-pressed={language === 'r'}
                  data-testid="statistician-script-language-r"
                  onClick={() => setLanguage('r')}
                >
                  {t('R')}
                </Button>
                <Button
                  type="button"
                  variant={language === 'python' ? 'default' : 'outline'}
                  aria-pressed={language === 'python'}
                  data-testid="statistician-script-language-python"
                  onClick={() => setLanguage('python')}
                >
                  {t('Python')}
                </Button>
              </div>
              <textarea
                data-testid="statistician-script-source"
                className={dialogFormTextareaClassName}
                rows={4}
                value={source}
                onChange={(event) => setSource(event.target.value)}
              />
            </section>
            <section className="space-y-2">
              <h2 className={dialogFormLabelClassName}>{t('Variable definition table')}</h2>
              <p className={dialogFormHelpClassName}>
                {t('Name, definition, type, and coding, separated by tabs.')}
              </p>
              <textarea
                data-testid="statistician-variable-definition"
                className={dialogFormTextareaClassName}
                rows={3}
                value={definition}
                onChange={(event) => setDefinition(event.target.value)}
              />
            </section>
            <section className="space-y-2">
              <h2 className={dialogFormLabelClassName}>{t('Execution log')}</h2>
              <textarea
                data-testid="statistician-execution-log"
                className={dialogFormTextareaClassName}
                rows={3}
                value={log}
                onChange={(event) => setLog(event.target.value)}
              />
            </section>
            {status ? (
              <p data-testid="statistician-export-status" className="text-sm text-text-000">
                {status}
              </p>
            ) : null}
          </div>
          <footer className="flex justify-end gap-2 border-t border-border-300/90 px-5 py-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              {t('Cancel')}
            </Button>
            <Button
              type="button"
              data-testid="statistician-review-export"
              disabled={pending}
              onClick={() => void exportPackage()}
            >
              {t('Review and export')}
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export { StatisticianReviewExportDialog }
