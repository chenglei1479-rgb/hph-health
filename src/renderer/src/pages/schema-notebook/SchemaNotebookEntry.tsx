import { useEffect, useState } from 'react'

import type {
  ExecuteAnalysisResponse,
  ImportTableResponse,
  SchemaModelContext
} from '../../../../shared/schema-notebook'
import { schemaNotebookCopy } from './copy'

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
  const copy = schemaNotebookCopy('ja')
  const [open, setOpen] = useState(false)
  const [tagged, setTagged] = useState(false)
  const [patientData, setPatientData] = useState(true)
  const [file, setFile] = useState<File | null>(null)
  const [context, setContext] = useState<SchemaModelContext | null>(null)
  const [blocked, setBlocked] = useState<string | null>(null)
  const [identifierWarnings, setIdentifierWarnings] = useState<string[]>([])
  const [code, setCode] = useState(
    'import pandas as pd\ndf = pd.read_csv("table.csv")\nprint(df.shape)'
  )
  const [language, setLanguage] = useState<'python' | 'r'>('python')
  const [result, setResult] = useState<ExecuteAnalysisResponse | null>(null)
  const [busy, setBusy] = useState(false)

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
        setContext(null)
        setIdentifierWarnings([])
        setBlocked(response.message)
        return
      }
      setIdentifierWarnings(response.identifierWarnings.map((warning) => warning.message))
      setContext(response.context)
      setTagged(response.tagged)
      setResult(null)
    } catch (error) {
      setBlocked(error instanceof Error ? error.message : String(error))
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
      setBlocked(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2 space-y-2">
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
          {identifierWarnings.length > 0 ? (
            <ul aria-label={copy.identifierWarnings} className="space-y-1 text-xs text-[#9a5046]">
              {identifierWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
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
              <button type="button" disabled={busy} onClick={() => void run()}>
                {copy.run}
              </button>
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
