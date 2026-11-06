import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorNotice } from '@/components/error-notice'
import { useProjectStore } from '@/stores/project-store'
import { EthicsWritingNotice } from '@/pages/writing-safeguards/EthicsWritingNotice'
import {
  isConsultationPack,
  isMentorDiscussionPack
} from '../../../../shared/deliverable-pack-policy'
import type {
  CsvEncoding,
  ExecuteAnalysisResponse,
  ImportTableResponse,
  SchemaModelContext,
  SchemaNotebookRunOutput
} from '../../../../shared/schema-notebook'
import { failureText, importFailureCopy } from './schema-notebook-error-copy'
import { deliverableCardCopy } from '../home/deliverable-packages'
import { loadSchemaNotebookDraft, saveSchemaNotebookDraft } from './schema-notebook-draft'

// The transport chrome and the two actionable sentences live in schema-notebook-error-copy, so each
// branch has a direct test; this module only decides where the failure is shown.

type SchemaNotebookApi = {
  importTable: (request: {
    projectId: string
    filename: string
    /** Bytes, never a decoded string: the main process owns CSV decoding. */
    csvBase64?: string
    xlsxBase64?: string
    patientData?: boolean
  }) => Promise<ImportTableResponse>
  optInCategorical: (request: {
    projectId: string
    tableId: string
    column: string
    actor?: string
  }) => Promise<SchemaModelContext>
  execute: (request: {
    projectId: string
    tableId: string
    language: 'python' | 'r'
    code: string
  }) => Promise<ExecuteAnalysisResponse>
  saveOutput: (request: {
    projectId: string
    runId: string
    relativePath: string
  }) => Promise<{ saved: boolean }>
  lastRun: (request: {
    projectId: string
    tableId: string
  }) => Promise<{ runId: string; outputs: SchemaNotebookRunOutput[] } | null>
  modelContext: (request: { projectId: string; tableId: string }) => Promise<SchemaModelContext>
  patientDataTags: () => Promise<Array<{ projectId: string }>>
}

const api = (): SchemaNotebookApi | null => {
  const candidate = window.api as { schemaNotebook?: SchemaNotebookApi } | undefined
  return candidate?.schemaNotebook ?? null
}

// Small enough to avoid a formatting dependency: the panel only shows a rough size next to a name.
const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

// CSV bytes travel to the main process, which owns decoding. Excel on a Japanese Windows writes
// CP932, and reading it as UTF-8 here turned every header into U+FFFD — including the headers the
// identifier and PHI scans rely on.
const readFile = (file: File): Promise<{ csvBase64?: string; xlsxBase64?: string }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    const isCsv = file.name.toLowerCase().endsWith('.csv')
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result as ArrayBuffer)
      let binary = ''
      for (const byte of bytes) binary += String.fromCharCode(byte)
      const base64 = btoa(binary)
      resolve(isCsv ? { csvBase64: base64 } : { xlsxBase64: base64 })
    }
    reader.readAsArrayBuffer(file)
  })

export const PatientDataBadge = (): React.JSX.Element => {
  const { t } = useTranslation()
  return (
    <span
      data-patient-data-badge
      title={t('This tag cannot be removed. To work without patient data, create a new project.')}
      className="shrink-0 rounded-full bg-[#9a5046]/10 px-2 py-0.5 text-[11px] font-semibold text-[#9a5046]"
    >
      {t('Contains patient data')}
    </span>
  )
}

export const SchemaNotebookEntry = ({ projectId }: { projectId: string }): React.JSX.Element => {
  const { t } = useTranslation()
  // #167: two import sentences are actionable and get a catalogue entry; an unknown failure is shown
  // verbatim, because translating a diagnostic would hide the text people search for in a report.
  const localizeImportFailure = (text: string): string => {
    const copy = importFailureCopy(text)
    return copy ? t(copy.key, copy.params) : text
  }
  const agentContext = useProjectStore(
    (state) => state.projects.find((project) => project.id === projectId)?.agentContext
  )
  const mentorPack = isMentorDiscussionPack(agentContext)
  const consultationPack = isConsultationPack(agentContext)
  const [approvalNumber, setApprovalNumber] = useState('')
  const [approvalProjectId, setApprovalProjectId] = useState<string | null>(null)
  const shownApprovalNumber =
    consultationPack && approvalProjectId === projectId ? approvalNumber : ''
  const [open, setOpen] = useState(false)
  const [tagged, setTagged] = useState(false)
  const [patientData, setPatientData] = useState(true)
  const [file, setFile] = useState<File | null>(null)
  const [context, setContext] = useState<SchemaModelContext | null>(null)
  const [blocked, setBlocked] = useState<string | null>(null)
  const [identifierWarnings, setIdentifierWarnings] = useState<string[]>([])
  const [code, setCode] = useState(() => loadSchemaNotebookDraft(projectId).code)
  const [language, setLanguage] = useState<'python' | 'r'>(
    () => loadSchemaNotebookDraft(projectId).language
  )
  const [restoreNotice, setRestoreNotice] = useState(false)
  const [csvEncoding, setCsvEncoding] = useState<CsvEncoding | undefined>(undefined)
  const [result, setResult] = useState<ExecuteAnalysisResponse | null>(null)
  // Files the current table's newest run left behind. Loaded from the run record on mount, so a figure
  // is still listed after the app restarts (#121); the record itself, not this state, is the storage.
  const [runOutputs, setRunOutputs] = useState<{
    runId: string
    outputs: SchemaNotebookRunOutput[]
  } | null>(null)
  const [outputNotice, setOutputNotice] = useState<string | null>(null)
  const [outputError, setOutputError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // The imported table is referenced by its stored id, never by file contents. It can go missing
  // (project cleanup, restarted storage), so the restore path re-reads the context and says so.
  const [tableInfo, setTableInfo] = useState<{ tableId?: string; filename?: string }>(() => {
    const draft = loadSchemaNotebookDraft(projectId)
    return { tableId: draft.tableId, filename: draft.filename }
  })
  // Which project the in-memory state belongs to. Until the load effect has applied the new project,
  // the save effect must not run: it would otherwise write the previous project's code and table id
  // into the new project's key for one frame.
  const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null)
  // The table whose newest run the panel lists. It survives a failed table restore on purpose: the run
  // record and its files do not depend on the table csv, so the figures stay reachable (#121).
  const [runSourceTableId, setRunSourceTableId] = useState<string | undefined>(
    () => loadSchemaNotebookDraft(projectId).lastRunTableId
  )

  // Reads the newest run record for one table. Callers own the state update so they can guard against
  // a project switch that lands mid-read.
  const fetchLastRunOutputs = async (
    tableId: string
  ): Promise<{ runId: string; outputs: SchemaNotebookRunOutput[] } | null> => {
    const notebook = api()
    if (!notebook) return null
    try {
      const previous = await notebook.lastRun({ projectId, tableId })
      return previous && previous.outputs.length > 0
        ? { runId: previous.runId, outputs: previous.outputs }
        : null
    } catch {
      return null
    }
  }

  useEffect(() => {
    const draft = loadSchemaNotebookDraft(projectId)
    setCode(draft.code)
    setLanguage(draft.language)
    setContext(null)
    setResult(null)
    setRunOutputs(null)
    setOutputNotice(null)
    setOutputError(null)
    setBlocked(null)
    setRestoreNotice(false)
    setTableInfo({ tableId: draft.tableId, filename: draft.filename })
    const runSource = draft.lastRunTableId ?? draft.tableId
    setRunSourceTableId(runSource)
    setLoadedProjectId(projectId)
    const notebook = api()
    let cancelled = false
    // One table owns the listed outputs. When the table restores, its id decides which run is shown;
    // when it cannot be restored we fall back to the recorded run source, so a lost table csv still
    // leaves its figures listed (#121 review).
    const hydrate = (tableId: string | undefined): void => {
      if (!tableId) return
      void fetchLastRunOutputs(tableId).then((previous) => {
        if (cancelled) return
        setRunOutputs(previous)
      })
    }
    if (!draft.tableId || !notebook?.modelContext) {
      if (draft.tableId) setRestoreNotice(true)
      hydrate(runSource)
      return () => {
        cancelled = true
      }
    }
    void (async () => {
      try {
        const restored = await notebook.modelContext({ projectId, tableId: draft.tableId! })
        if (cancelled) return
        // A missing table must not leave the panel looking restored.
        if (!restored || typeof restored !== 'object' || !('tableId' in restored)) {
          throw new Error('The stored table could not be reopened.')
        }
        setContext(restored)
        // The restored table can differ from the draft's run source (the draft keeps the last run
        // source separately), so re-read against the table that is actually open.
        setRunSourceTableId(restored.tableId)
        hydrate(restored.tableId)
      } catch {
        if (cancelled) return
        // Clearing the table reference is deliberate (the panel stops retrying an unreadable table).
        // `runSourceTableId` is not part of `tableInfo`, so the figures stay reachable.
        setTableInfo({})
        setRestoreNotice(true)
        hydrate(runSource)
      }
    })()
    return () => {
      cancelled = true
    }
    // fetchLastRunOutputs closes over api()/projectId only; the effect re-runs per project.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    // Save under the project this in-memory state actually belongs to. A superseded frame during a
    // project switch can then only re-write the outgoing project's own key, never the incoming one.
    if (!loadedProjectId) return
    saveSchemaNotebookDraft(loadedProjectId, { ...tableInfo, lastRunTableId: runSourceTableId, code, language })
  }, [loadedProjectId, tableInfo, runSourceTableId, code, language])

  useEffect(() => {
    if (!consultationPack || !window.api?.writingSafeguards) return
    let cancelled = false
    void window.api.writingSafeguards
      .getEthicsApproval({ projectId })
      .then((record) => {
        if (cancelled) return
        setApprovalNumber(record.approvalNumber)
        setApprovalProjectId(projectId)
      })
      .catch(() => {
        if (cancelled) return
        setApprovalNumber('')
        setApprovalProjectId(projectId)
      })
    return () => {
      cancelled = true
    }
  }, [consultationPack, projectId])

  useEffect(() => {
    const notebook = api()
    if (!notebook) return
    let cancelled = false
    void notebook
      .patientDataTags()
      .then((tags) => {
        if (!cancelled) setTagged(tags.some((tag) => tag.projectId === projectId))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [projectId])

  // A failed import must not leave the previous table on screen: its row count, columns and
  // synthetic sample would read as the result of the file that just failed. The stored table
  // reference is kept on purpose — the file that failed is a different one, so the table that was
  // imported earlier is still there and reopening the project must be able to restore it. A table
  // whose own file is gone takes the restore path below instead, which does clear the reference.
  const showImportFailure = (message: string): void => {
    setContext(null)
    setResult(null)
    setIdentifierWarnings([])
    setBlocked(message)
    // A previous "the stored table is gone" notice belongs to a different failure: keeping it next to
    // this error would say both "it cannot be restored" and "it can be restored".
    setRestoreNotice(false)
  }

  const importFile = async (): Promise<void> => {
    const notebook = api()
    if (!notebook || !file) return
    setBusy(true)
    setBlocked(null)
    try {
      const body = await readFile(file)
      const response = await notebook.importTable({
        projectId,
        filename: file.name,
        patientData,
        ...body
      })
      if (!response.ok) {
        showImportFailure(response.message)
        return
      }
      setIdentifierWarnings(response.identifierWarnings.map((warning) => warning.message))
      setContext(response.context)
      setTagged(response.tagged)
      setResult(null)
      setRestoreNotice(false)
      setCsvEncoding(response.encoding)
      setTableInfo({ tableId: response.context.tableId, filename: file.name })
      setRunSourceTableId(response.context.tableId)
      // A different table means the listed files belong to someone else: clear them before reading this
      // table's own newest run, so table A's figures can never sit beside table B's schema (#121 review).
      setRunOutputs(null)
      setOutputNotice(null)
      setOutputError(null)
      setRunOutputs(await fetchLastRunOutputs(response.context.tableId))
    } catch (error) {
      // Strip the IPC transport chrome so the panel shows the main process sentence, not
      // "Error invoking remote method 'schema-notebook:import-table': ...".
      showImportFailure(localizeImportFailure(failureText(error)))
    } finally {
      setBusy(false)
    }
  }

  const optIn = async (column: string): Promise<void> => {
    const notebook = api()
    if (!notebook || !context) return
    const next = await notebook.optInCategorical({ projectId, tableId: context.tableId, column })
    setContext(next)
  }

  const run = async (): Promise<void> => {
    const notebook = api()
    if (!notebook || !context) return
    setBusy(true)
    try {
      const executed = await notebook.execute({
        projectId,
        tableId: context.tableId,
        language,
        code
      })
      setResult(executed)
      setRunSourceTableId(context.tableId)
      setRunOutputs(
        executed.local.outputs.length > 0
          ? { runId: executed.runId, outputs: executed.local.outputs }
          : null
      )
      setOutputNotice(null)
      setOutputError(null)
    } catch (error) {
      // The main process localizes this failure: the execute channel is a direct IPC channel, so a code
      // set on the thrown error never reaches the renderer. Showing the sentence as-is keeps the panel
      // in one language.
      setBlocked(failureText(error))
    } finally {
      setBusy(false)
    }
  }

  // Saves one copy of a run output through the system dialog. The main process re-checks the bytes
  // against the checksum the run recorded, so a file changed on disk is reported instead of saved.
  const saveRunOutput = async (relativePath: string): Promise<void> => {
    const notebook = api()
    if (!notebook || !runOutputs) return
    setOutputNotice(null)
    setOutputError(null)
    try {
      const saved = await notebook.saveOutput({
        projectId,
        runId: runOutputs.runId,
        relativePath
      })
      // A cancelled dialog is a normal outcome, not a failure; it says nothing.
      if (saved.saved) setOutputNotice(t('Saved.'))
    } catch (error) {
      setOutputError(failureText(error))
    }
  }

  if (mentorPack) {
    const mentorCopy = deliverableCardCopy(t)['mentor-pack']
    return (
      <div
        data-testid="mentor-pack-no-patient-table"
        className="mt-2 space-y-1 rounded-lg border border-[#e4ded2] bg-[#faf8f2] px-3 py-2 text-xs leading-5 text-[#635f56]"
      >
        <p className="font-medium text-[#9a5046]">{mentorCopy.hardRule}</p>
        <p>{mentorCopy.inputNotice}</p>
      </div>
    )
  }

  return (
    <div className="mt-2 space-y-2">
      <EthicsWritingNotice open={consultationPack} approvalNumber={shownApprovalNumber} />
      <div className="flex flex-wrap items-center gap-2">
        {tagged ? <PatientDataBadge /> : null}
        {tagged ? <span className="sr-only">{t('This project contains patient data, so the tag cannot be removed.')}</span> : null}
        <button
          type="button"
          className="rounded-md px-2 py-1 text-xs font-medium text-[#315b67] hover:bg-bg-300"
          onClick={() => setOpen(true)}
        >
          {t('Analyze patient table')}
        </button>
      </div>
      {open ? (
        <section
          role="dialog"
          aria-label={t('Local Notebook (schema only)')}
          className="space-y-3 rounded-lg border border-[#d5dfdc] bg-white p-3 text-sm text-[#20343a]"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-medium">{t('Local Notebook (schema only)')}</h2>
              <p className="mt-1 text-xs leading-5 text-[#5a6b6c]">{t('The table is analyzed in your local Notebook. The model receives only column names, types, row count, and synthetic samples generated from the schema.')}</p>
              <p className="mt-1 text-xs leading-5 text-[#5a6b6c]">
                <span className="font-medium text-[#20343a]">{t('What the model receives')}</span>{' '}
                {t('Cells under 10 are hidden to protect privacy. Your local Notebook still shows the real numbers.')}
              </p>
              <p className="mt-1 text-xs leading-5 text-[#5a6b6c]">{t("Rows for an individual patient (.head(), .tail(), .sample(), one person's values, row-by-row views) are never sent to the model.")}</p>
              <p className="mt-1 text-xs leading-5 text-[#5a6b6c]">{t('Text returned to the model passes a masking check. Replaced values are pseudonymized.')}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)}>
              {t('Close')}
            </button>
          </div>
          {tagged ? <p className="text-xs text-[#9a5046]">{t('This project contains patient data, so the tag cannot be removed.')}</p> : null}
          <label className="block text-xs">
            {t('CSV or Excel')}
            <input
              className="mt-1 block w-full text-xs"
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={patientData}
              onChange={(event) => setPatientData(event.target.checked)}
            />
            {t('This table contains patient data')}
          </label>
          <button type="button" disabled={!file || busy} onClick={() => void importFile()}>
            {t('Import file')}
          </button>
          {blocked ? (
            <pre className="whitespace-pre-wrap text-xs text-[#9a5046]">{blocked}</pre>
          ) : null}
          {/* The failed file is not the stored table, so say what the user can still do. The error
              above stays first: this line explains recovery, it does not replace the reason. Gated on
              `blocked` too: without it the line would flash while a project switch is still restoring
              the table (tableId is set, the context has not arrived), which is not a failure at all. */}
          {blocked && tableInfo.tableId && !context ? (
            <p data-testid="schema-notebook-table-still-saved" className="text-xs text-[#5a6b6c]">
              {t('The previously imported table is still saved. Switch to another project and come back to restore it.')}
            </p>
          ) : null}
          {restoreNotice ? (
            <p data-testid="schema-notebook-restore-notice" className="text-xs text-[#9a5046]">
              {t('The previously imported table could not be restored. Choose the file again. Your local code is kept.')}
            </p>
          ) : null}
          {identifierWarnings.length > 0 ? (
            <ul aria-label={t('Pre-send checks and restrictions help prevent sending direct identifiers such as names and patient IDs. This is not an absolute guarantee.')} className="space-y-1 text-xs text-[#9a5046]">
              {identifierWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
          {/* The code editor stays available without a table: the draft survives a project switch
              and a lost import, and Run only needs a table to execute against. */}
          <label className="block text-xs">
            {t('Language')}
            <select
              className="ml-2"
              value={language}
              onChange={(event) => setLanguage(event.target.value as 'python' | 'r')}
            >
              <option value="python">Python</option>
              <option value="r">R</option>
            </select>
          </label>
          <label className="block text-xs">
            {t('Python or R code')}
            <textarea
              className="mt-1 block w-full font-mono text-xs"
              rows={5}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
          <button type="button" disabled={busy || !context} onClick={() => void run()}>
            {t('Run locally')}
          </button>
          {context ? (
            <div className="space-y-2">
              {csvEncoding ? (
                // The user checks for mojibake before trusting the columns: showing the encoding is
                // what makes a CP932 file verifiable instead of silently garbled.
                <p data-testid="schema-notebook-csv-encoding" className="text-xs text-[#5a6b6c]">
                  {t('Read as {{encoding}}. If the text is garbled, save the file again in Excel as "CSV UTF-8 (Comma delimited)".', { encoding: csvEncoding === 'shift_jis' ? 'Shift_JIS' : 'UTF-8' })}
                </p>
              ) : null}
              <p>
                {t('Rows')}: {context.rowCount}
              </p>
              <ul>
                {context.columns.map((column) => (
                  <li key={column.name} className="flex flex-wrap items-center gap-2">
                    <span>
                      {t('Columns')}: {column.name} ({column.dtype})
                    </span>
                    {column.dtype === 'categorical' || column.dtype === 'binary' ? (
                      <label className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          data-categorical-opt-in={column.name}
                          checked={Boolean(context.categoricalValues?.[column.name])}
                          onChange={() => void optIn(column.name)}
                        />
                        {t("Send this column's category values to the model")}
                      </label>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-[#5a6b6c]">{t('Not sent by default. Sending is recorded. Free-text columns cannot be selected. A column with more than 12 categories can be selected, but only the 12 most frequent are sent, and the rest are shown as other values omitted.')}</p>
              <p className="text-xs">{t('Synthetic sample (not drawn from real rows)')}</p>
              <pre className="overflow-auto text-xs">
                {JSON.stringify(context.syntheticSampleRows)}
              </pre>
              {result?.interpreter ? (
                // Falling back to a Python on PATH is not silent: say which interpreter ran the
                // script, so a missing bundled runtime reads as such instead of as a broken package.
                <p data-testid="schema-notebook-interpreter" className="text-xs text-[#5a6b6c]">
                  {result.interpreter.source === 'bundled'
                    ? t('Runtime: bundled Python {{version}} (offline)', {
                        version: result.interpreter.version
                      })
                    : t('Runtime: system Python {{version}} (the bundled runtime could not start)', {
                        version: result.interpreter.version
                      })}
                </p>
              ) : null}
              {result ? (
                <div className="grid gap-2">
                  <pre aria-label={t('Local result')}>{result.local.stdout}</pre>
                  <p>{t('Masking check')}</p>
                  <pre aria-label={t('Masking check')}>{JSON.stringify(result.forModel)}</pre>
                  <p>{t('Pseudonymized')}</p>
                </div>
              ) : null}
            </div>
          ) : null}
          {/* Files a run kept. Rendered OUTSIDE the `context` branch on purpose: when the stored table
              file goes missing the panel cannot restore the table, but the figures from its last run are
              still on disk and the record still lists them, so they stay listed and saveable. */}
          {runOutputs && runOutputs.outputs.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs text-[#5a6b6c]">
                {t(
                  'Files saved by this run (they stay after you close the app; use the button on the right to save a copy)'
                )}
              </p>
              <ul
                aria-label={t(
                  'Files saved by this run (they stay after you close the app; use the button on the right to save a copy)'
                )}
                className="space-y-1 text-xs"
              >
                {runOutputs.outputs.map((output) => (
                  <li
                    key={output.relativePath}
                    data-testid="schema-notebook-output"
                    className="flex flex-wrap items-center gap-2"
                  >
                    <span className="font-mono">{output.relativePath}</span>
                    <span>{formatBytes(output.sizeBytes)}</span>
                    <button type="button" onClick={() => void saveRunOutput(output.relativePath)}>
                      {t('Save a copy')}
                    </button>
                  </li>
                ))}
              </ul>
              {outputNotice ? (
                <p data-testid="schema-notebook-output-saved" className="text-xs text-[#315b67]">
                  {outputNotice}
                </p>
              ) : null}
              {outputError ? (
                <div data-testid="schema-notebook-output-error">
                  <ErrorNotice inline level="error" description={outputError} />
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
