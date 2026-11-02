import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useLocaleStore } from '@/stores/locale-store'

import type { Project } from '../../../../shared/projects'
import {
  applyCoiChoice,
  buildAiUsageDeclaration,
  type AiUsageStatement
} from '../../../../shared/writing-safeguards/ai-usage-declaration'
import { ethicsWritingReminder } from '../../../../shared/writing-safeguards/ethics-approval'
import {
  releaseExport,
  releaseExportSet,
  type ExportFinding
} from '../../../../shared/writing-safeguards/export-deidentify'
import { writingSafeguardsCopy, type WritingSafeguardsCopy } from './copy'
import { EthicsProtocolChecklist } from './EthicsProtocolChecklist'
import { collectRecordedAgentRuns, statementsFromRuns } from './ai-usage-records'

const downloadText = (filename: string, text: string): void => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

const readExportFile = (file: File): Promise<{ name: string; text: string }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.onload = () => resolve({ name: file.name, text: String(reader.result ?? '') })
    reader.readAsText(file)
  })

const findingLabel = (copy: WritingSafeguardsCopy, kind: ExportFinding['kind']): string => {
  if (kind === 'karte-number') return copy.findingKarte
  if (kind === 'birth-date') return copy.findingBirth
  return copy.findingValue
}

export const WritingSafeguardsEntry = (): React.JSX.Element => {
  const locale = useLocaleStore((state) => state.locale)
  const { t } = useTranslation()
  const copy = writingSafeguardsCopy(locale)
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const [approvalNumber, setApprovalNumber] = useState('')
  const [saved, setSaved] = useState(false)
  const [started, setStarted] = useState(false)
  const [showReminder, setShowReminder] = useState(false)
  // The declaration is built from recorded executions only; `recordedStatements` is what the run
  // records produced and `statementEdits` holds the doctor's wording changes (#133).
  const [recordedStatements, setRecordedStatements] = useState<AiUsageStatement[]>([])
  const [statementEdits, setStatementEdits] = useState<AiUsageStatement[] | null>(null)
  const [runsState, setRunsState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle')
  const [runsTruncated, setRunsTruncated] = useState(false)
  const [authorConfirmed, setAuthorConfirmed] = useState(false)
  const statements = useMemo(
    () => statementEdits ?? recordedStatements,
    [recordedStatements, statementEdits]
  )
  // Whether the records were readable decides which sentence is honest: "none recorded" may only
  // appear after a successful read. It is derived from what the read produced, not from the
  // statements after editing — blanking every feature must not turn "3 executions recorded" into
  // "no execution recorded" (#133 review).
  const recordsState = useMemo(
    () =>
      runsState === 'ready' ? (recordedStatements.length > 0 ? 'recorded' : 'none') : 'unreadable',
    [recordedStatements.length, runsState]
  )
  const [includeCoi, setIncludeCoi] = useState(false)
  const [draft, setDraft] = useState(
    () =>
      buildAiUsageDeclaration({
        statements: [],
        // First paint has no read behind it yet; 'none' would flash "no execution recorded"
        // before the run records are even requested.
        records: 'unreadable',
        language: locale
      }).draft
  )
  const [draftEdited, setDraftEdited] = useState(false)
  const [manuscript, setManuscript] = useState('')
  const [files, setFiles] = useState<Array<{ name: string; text: string }>>([])
  const [findings, setFindings] = useState<ExportFinding[]>([])
  const [confirmed, setConfirmed] = useState(false)
  const [exported, setExported] = useState(false)

  useEffect(() => {
    if (draftEdited) return
    // The disclosure draft is derived from the recorded statements unless the doctor has edited it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(
      buildAiUsageDeclaration({
        statements,
        records: recordsState,
        recordedCount: recordedStatements.length,
        includeCoi,
        language: locale,
        authorConfirmed
      }).draft
    )
  }, [
    authorConfirmed,
    draftEdited,
    includeCoi,
    locale,
    recordsState,
    recordedStatements.length,
    statements
  ])

  const openDialog = (): void => {
    setOpen(true)
    void window.api.projects
      .list()
      .then((loaded) => setProjects(loaded))
      .catch(() => setProjects([]))
  }

  const loadRecordedRuns = (id: string): void => {
    setStatementEdits(null)
    setRecordedStatements([])
    setRunsTruncated(false)
    setAuthorConfirmed(false)
    if (!id) {
      setRunsState('idle')
      return
    }
    setRunsState('loading')
    void collectRecordedAgentRuns(window.api, id)
      .then((projection) => {
        setRunsState(projection.status === 'ready' ? 'ready' : 'unavailable')
        setRecordedStatements(
          projection.status === 'ready' ? statementsFromRuns(projection.runs) : []
        )
        setRunsTruncated(projection.truncated)
      })
      // A failed read is a visible state, not an empty declaration: "we could not look" and "there
      // is nothing" must not read the same.
      .catch(() => {
        setRunsState('unavailable')
        setRecordedStatements([])
      })
  }

  const chooseProject = (id: string): void => {
    setProjectId(id)
    setSaved(false)
    loadRecordedRuns(id)
    if (!id || !window.api.writingSafeguards) {
      setApprovalNumber('')
      return
    }
    void window.api.writingSafeguards
      .getEthicsApproval({ projectId: id })
      .then((record) => setApprovalNumber(record.approvalNumber))
      .catch(() => setApprovalNumber(''))
  }

  const saveEthics = (): void => {
    if (!projectId || !window.api.writingSafeguards) return
    void window.api.writingSafeguards
      .setEthicsApproval({ projectId, approvalNumber })
      .then((record) => {
        setApprovalNumber(record.approvalNumber)
        setSaved(true)
      })
      .catch(() => setSaved(false))
  }

  const beginWriting = (): void => {
    setShowReminder(ethicsWritingReminder(approvalNumber, locale).show)
    setStarted(true)
  }

  const reminder = showReminder ? ethicsWritingReminder(undefined, locale).message : ''

  const updateStatement = (index: number, patch: Partial<AiUsageStatement>): void => {
    // Any edit invalidates the author's verification: the sentence they checked is not the sentence
    // the text now carries (#133 review).
    setAuthorConfirmed(false)
    setStatementEdits((current) =>
      (current ?? recordedStatements).map((statement, statementIndex) =>
        statementIndex === index ? { ...statement, ...patch } : statement
      )
    )
  }

  const rebuild = (): void => {
    setDraftEdited(false)
    setDraft(
      buildAiUsageDeclaration({
        statements,
        records: recordsState,
        recordedCount: recordedStatements.length,
        includeCoi,
        language: locale,
        authorConfirmed
      }).draft
    )
  }

  const showFindings = (next: ExportFinding[]): boolean => {
    if (next.length === 0 || confirmed) return false
    setFindings(next)
    setExported(false)
    return true
  }

  const exportManuscript = (): void => {
    const text = `${manuscript.trim()}\n\n${applyCoiChoice(draft, includeCoi, locale)}`
    const release = releaseExport({ name: 'manuscript.md', text, confirmed })
    if (!release.ok) {
      showFindings(release.findings)
      return
    }
    downloadText('manuscript.md', text)
    setFindings([])
    setExported(true)
  }

  const exportFiles = (): void => {
    const release = releaseExportSet(files, confirmed)
    if (!release.ok) {
      showFindings(release.findings)
      return
    }
    for (const file of files) downloadText(file.name, file.text)
    setFindings([])
    setExported(true)
  }

  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-40">
      <button
        type="button"
        className="pointer-events-auto rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground shadow-sm"
        onClick={openDialog}
      >
        {copy.open}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={copy.title}
          className="pointer-events-auto mt-2 max-h-[70vh] w-[36rem] max-w-[calc(100vw-1.5rem)] space-y-3 overflow-auto rounded-md border border-border bg-background p-4 text-sm text-foreground shadow-lg"
        >
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base font-medium">{copy.title}</h2>
            <button type="button" onClick={() => setOpen(false)}>
              {copy.close}
            </button>
          </div>
          <label className="block">
            <span>{copy.project}</span>
            <select
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1"
              value={projectId}
              onChange={(event) => chooseProject(event.target.value)}
            >
              <option value="">{copy.project}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span>{copy.ethicsLabel}</span>
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1"
              value={approvalNumber}
              onChange={(event) => setApprovalNumber(event.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={saveEthics}>
              {copy.ethicsSave}
            </button>
            <button type="button" onClick={beginWriting}>
              {copy.beginWriting}
            </button>
          </div>
          {saved ? <p role="status">{copy.ethicsSaved}</p> : null}
          {started ? <p role="status">{copy.writingStarted}</p> : null}
          {reminder ? (
            <p role="status" data-ethics-writing-reminder>
              {reminder}
            </p>
          ) : null}
          <EthicsProtocolChecklist projectId={projectId} />
          <section data-writing-safeguards-disclosure>
            <h3 className="font-medium">{copy.declarationTitle}</h3>
            <p>
              {t(
                'Every statement below cites the execution it comes from. Only executions recorded for this project appear.'
              )}
            </p>
            {runsState === 'unavailable' ? (
              <p role="status" data-writing-safeguards-runs-unavailable>
                {t(
                  'Run records could not be read, so no AI usage is declared. Select the project again to retry.'
                )}
              </p>
            ) : null}
            {runsState === 'ready' ? (
              <p role="status" data-writing-safeguards-runs-count>
                {t('Recorded executions: {{shown}}', { shown: statements.length })}
              </p>
            ) : null}
            {runsTruncated ? (
              <p role="status">
                {t('Only the {{shown}} most recent executions are listed.', {
                  shown: statements.length
                })}
              </p>
            ) : null}
            <ul>
              {statements.map((statement, index) => (
                <li
                  key={`${statement.evidence.kind}:${
                    statement.evidence.kind === 'notebook-run'
                      ? statement.evidence.runId
                      : statement.evidence.artifactId
                  }`}
                  data-writing-safeguards-statement
                >
                  <code>
                    {statement.evidence.kind === 'notebook-run'
                      ? statement.evidence.runId
                      : statement.evidence.artifactId}
                  </code>
                  <input
                    aria-label={copy.feature}
                    value={statement.feature}
                    onChange={(event) => updateStatement(index, { feature: event.target.value })}
                  />
                  <input
                    aria-label={copy.model}
                    value={statement.model}
                    onChange={(event) => updateStatement(index, { model: event.target.value })}
                  />
                  <input
                    aria-label={copy.purpose}
                    value={statement.purpose}
                    onChange={(event) => updateStatement(index, { purpose: event.target.value })}
                  />
                </li>
              ))}
            </ul>
            <p data-writing-safeguards-review-state>
              {authorConfirmed ? t('Confirmed') : t('Unconfirmed')}
            </p>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                aria-label={t('I verified this declaration.')}
                checked={authorConfirmed}
                onChange={(event) => setAuthorConfirmed(event.target.checked)}
              />
              <span>{t('I verified this declaration.')}</span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                aria-label={copy.coi}
                checked={includeCoi}
                onChange={(event) => {
                  // Changing what the declaration says invalidates the verification, exactly as
                  // editing a statement does.
                  setIncludeCoi(event.target.checked)
                  setAuthorConfirmed(false)
                }}
              />
              <span>{copy.coi}</span>
            </label>
            <button type="button" onClick={rebuild}>
              {copy.rebuild}
            </button>
          </section>
          <label className="block">
            <span>{copy.declaration}</span>
            <textarea
              aria-label={copy.declaration}
              className="mt-1 h-36 w-full rounded-md border border-border bg-background px-2 py-1"
              value={draft}
              onChange={(event) => {
                setDraftEdited(true)
                setDraft(event.target.value)
              }}
            />
          </label>
          <label className="block">
            <span>{copy.manuscript}</span>
            <textarea
              aria-label={copy.manuscript}
              className="mt-1 h-24 w-full rounded-md border border-border bg-background px-2 py-1"
              value={manuscript}
              onChange={(event) => setManuscript(event.target.value)}
            />
          </label>
          <label className="block" data-writing-safeguards-export-files>
            <span>{copy.files}</span>
            <input
              className="mt-1 block w-full"
              type="file"
              multiple
              aria-label={copy.files}
              accept=".py,.r,.ipynb,.md,.tex,.txt,.html,.csv,.tsv,.xlsx"
              onChange={(event) => {
                const selected = [...(event.target.files ?? [])]
                void Promise.all(selected.map((file) => readExportFile(file))).then((loaded) => {
                  setFiles(loaded)
                  setConfirmed(false)
                  setFindings([])
                })
              }}
            />
          </label>
          {findings.length > 0 ? (
            <div data-writing-safeguards-findings>
              <p>{copy.findings}</p>
              <ul>
                {findings.map((finding) => (
                  <li key={`${finding.kind}:${finding.name}:${finding.excerpt}`}>
                    {[findingLabel(copy, finding.kind), finding.excerpt].join(' ')}
                  </li>
                ))}
              </ul>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>{copy.confirm}</span>
              </label>
            </div>
          ) : null}
          <div className="flex gap-2">
            <button type="button" onClick={exportManuscript}>
              {copy.exportManuscript}
            </button>
            <button type="button" disabled={files.length === 0} onClick={exportFiles}>
              {copy.exportFiles}
            </button>
          </div>
          {exported ? <p role="status">{copy.exported}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
