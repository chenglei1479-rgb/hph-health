import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useProjectStore } from '@/stores/project-store'
import { EthicsWritingNotice } from '@/pages/writing-safeguards/EthicsWritingNotice'
import {
  isConsultationPack,
  isMentorDiscussionPack
} from '../../../../shared/deliverable-pack-policy'
import type {
  ExecuteAnalysisResponse,
  ImportTableResponse,
  SchemaModelContext
} from '../../../../shared/schema-notebook'
import { deliverableCardCopy } from '../home/deliverable-packages'
import { schemaNotebookCopy } from './copy'
import { loadSchemaNotebookDraft, saveSchemaNotebookDraft } from './schema-notebook-draft'

// A direct IPC rejection arrives as "Error invoking remote method '<channel>': Error: <text>".
// The main process already renders the operable sentence with its stable code; show just that text so
// the panel never repeats internal transport chrome.
const failureText = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).replace(
    /^Error invoking remote method '[^']*':\s*(?:[A-Za-z]*Error:\s*)?/u,
    ''
  )

type SchemaNotebookApi = {
  importTable: (request: {
    projectId: string
    filename: string
    csvText?: string
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
  modelContext: (request: { projectId: string; tableId: string }) => Promise<SchemaModelContext>
  patientDataTags: () => Promise<Array<{ projectId: string }>>
}

const api = (): SchemaNotebookApi | null => {
  const candidate = window.api as { schemaNotebook?: SchemaNotebookApi } | undefined
  return candidate?.schemaNotebook ?? null
}

const readFile = (file: File): Promise<{ csvText?: string; xlsxBase64?: string }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    if (file.name.toLowerCase().endsWith('.csv')) {
      reader.onload = () => resolve({ csvText: String(reader.result ?? '') })
      reader.readAsText(file)
      return
    }
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result as ArrayBuffer)
      let binary = ''
      for (const byte of bytes) binary += String.fromCharCode(byte)
      resolve({ xlsxBase64: btoa(binary) })
    }
    reader.readAsArrayBuffer(file)
  })

export const PatientDataBadge = (): React.JSX.Element => {
  const copy = schemaNotebookCopy('ja')
  return (
    <span
      data-patient-data-badge
      title={copy.badgeNote}
      className="shrink-0 rounded-full bg-[#9a5046]/10 px-2 py-0.5 text-[11px] font-semibold text-[#9a5046]"
    >
      {copy.badge}
    </span>
  )
}

export const SchemaNotebookEntry = ({ projectId }: { projectId: string }): React.JSX.Element => {
  const { t } = useTranslation()
  const copy = schemaNotebookCopy('ja')
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
  const [result, setResult] = useState<ExecuteAnalysisResponse | null>(null)
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

  useEffect(() => {
    const draft = loadSchemaNotebookDraft(projectId)
    setCode(draft.code)
    setLanguage(draft.language)
    setContext(null)
    setResult(null)
    setBlocked(null)
    setRestoreNotice(false)
    setTableInfo({ tableId: draft.tableId, filename: draft.filename })
    setLoadedProjectId(projectId)
    if (!draft.tableId) return
    const notebook = api()
    if (!notebook?.modelContext) {
      setRestoreNotice(true)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const restored = await notebook.modelContext({ projectId, tableId: draft.tableId! })
        if (cancelled) return
        // A missing table must not leave the panel looking restored.
        if (!restored || typeof restored !== 'object' || !('tableId' in restored)) {
          throw new Error('The stored table could not be reopened.')
        }
        setContext(restored)
      } catch {
        if (cancelled) return
        setTableInfo({})
        setRestoreNotice(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    // Save under the project this in-memory state actually belongs to. A superseded frame during a
    // project switch can then only re-write the outgoing project's own key, never the incoming one.
    if (!loadedProjectId) return
    saveSchemaNotebookDraft(loadedProjectId, { ...tableInfo, code, language })
  }, [loadedProjectId, tableInfo, code, language])

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
      setTableInfo({ tableId: response.context.tableId, filename: file.name })
    } catch (error) {
      // Strip the IPC transport chrome so the panel shows the main process sentence, not
      // "Error invoking remote method 'schema-notebook:import-table': ...".
      showImportFailure(failureText(error))
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
      setResult(
        await notebook.execute({
          projectId,
          tableId: context.tableId,
          language,
          code
        })
      )
    } catch (error) {
      setBlocked(failureText(error))
    } finally {
      setBusy(false)
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
        {tagged ? <span className="sr-only">{copy.tagged}</span> : null}
        <button
          type="button"
          className="rounded-md px-2 py-1 text-xs font-medium text-[#315b67] hover:bg-bg-300"
          onClick={() => setOpen(true)}
        >
          {copy.open}
        </button>
      </div>
      {open ? (
        <section
          role="dialog"
          aria-label={copy.title}
          className="space-y-3 rounded-lg border border-[#d5dfdc] bg-white p-3 text-sm text-[#20343a]"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-medium">{copy.title}</h2>
              <p className="mt-1 text-xs leading-5 text-[#5a6b6c]">{copy.intro}</p>
              <p className="mt-1 text-xs leading-5 text-[#5a6b6c]">
                <span className="font-medium text-[#20343a]">{copy.modelView}</span>{' '}
                {copy.smallCellNote}
              </p>
              <p className="mt-1 text-xs leading-5 text-[#5a6b6c]">{copy.rowBlockNote}</p>
              <p className="mt-1 text-xs leading-5 text-[#5a6b6c]">{copy.maskingCheckNote}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)}>
              {copy.close}
            </button>
          </div>
          {tagged ? <p className="text-xs text-[#9a5046]">{copy.tagged}</p> : null}
          <label className="block text-xs">
            {copy.file}
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
            {copy.patientData}
          </label>
          <button type="button" disabled={!file || busy} onClick={() => void importFile()}>
            {copy.import}
          </button>
          {blocked ? (
            <pre className="whitespace-pre-wrap text-xs text-[#9a5046]">{blocked}</pre>
          ) : null}
          {restoreNotice ? (
            <p data-testid="schema-notebook-restore-notice" className="text-xs text-[#9a5046]">
              {copy.restoreNotice}
            </p>
          ) : null}
          {identifierWarnings.length > 0 ? (
            <ul aria-label={copy.identifierWarnings} className="space-y-1 text-xs text-[#9a5046]">
              {identifierWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
          {/* The code editor stays available without a table: the draft survives a project switch
              and a lost import, and Run only needs a table to execute against. */}
          <label className="block text-xs">
            {copy.language}
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
            {copy.code}
            <textarea
              className="mt-1 block w-full font-mono text-xs"
              rows={5}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
          <button type="button" disabled={busy || !context} onClick={() => void run()}>
            {copy.run}
          </button>
          {context ? (
            <div className="space-y-2">
              <p>
                {copy.rows}: {context.rowCount}
              </p>
              <ul>
                {context.columns.map((column) => (
                  <li key={column.name} className="flex flex-wrap items-center gap-2">
                    <span>
                      {copy.columns}: {column.name} ({column.dtype})
                    </span>
                    {column.dtype === 'categorical' || column.dtype === 'binary' ? (
                      <label className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          data-categorical-opt-in={column.name}
                          checked={Boolean(context.categoricalValues?.[column.name])}
                          onChange={() => void optIn(column.name)}
                        />
                        {copy.categorical}
                      </label>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-[#5a6b6c]">{copy.categoricalNote}</p>
              <p className="text-xs">{copy.synthetic}</p>
              <pre className="overflow-auto text-xs">
                {JSON.stringify(context.syntheticSampleRows)}
              </pre>
              {result?.interpreter ? (
                // Falling back to a Python on PATH is not silent: say which interpreter ran the
                // script, so a missing bundled runtime reads as such instead of as a broken package.
                <p data-testid="schema-notebook-interpreter" className="text-xs text-[#5a6b6c]">
                  {(result.interpreter.source === 'bundled'
                    ? copy.interpreterBundled
                    : copy.interpreterSystem
                  ).replace('{{version}}', result.interpreter.version)}
                </p>
              ) : null}
              {result ? (
                <div className="grid gap-2">
                  <pre aria-label={copy.localResult}>{result.local.stdout}</pre>
                  <p>{copy.maskingCheck}</p>
                  <pre aria-label={copy.maskingCheck}>{JSON.stringify(result.forModel)}</pre>
                  <p>{copy.pseudonymized}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
