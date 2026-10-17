import { useEffect, useMemo, useState } from 'react'

import { useLocaleStore } from '@/stores/locale-store'

import type { Project } from '../../../../shared/projects'
import {
  applyCoiChoice,
  buildAiUsageDeclaration,
  defaultAiUsageRecords,
  type AiUsageRecord
} from '../../../../shared/writing-safeguards/ai-usage-declaration'
import { ethicsWritingReminder } from '../../../../shared/writing-safeguards/ethics-approval'
import {
  releaseExport,
  releaseExportSet,
  type ExportFinding
} from '../../../../shared/writing-safeguards/export-deidentify'
import { writingSafeguardsCopy, type WritingSafeguardsCopy } from './copy'
import { EthicsProtocolChecklist } from './EthicsProtocolChecklist'

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

const emptyUsage = (): AiUsageRecord => ({ feature: '', model: '', purpose: '' })

const findingLabel = (copy: WritingSafeguardsCopy, kind: ExportFinding['kind']): string => {
  if (kind === 'karte-number') return copy.findingKarte
  if (kind === 'birth-date') return copy.findingBirth
  return copy.findingValue
}

export const WritingSafeguardsEntry = (): React.JSX.Element => {
  const locale = useLocaleStore((state) => state.locale)
  const copy = writingSafeguardsCopy(locale)
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const [approvalNumber, setApprovalNumber] = useState('')
  const [saved, setSaved] = useState(false)
  const [started, setStarted] = useState(false)
  const [showReminder, setShowReminder] = useState(false)
  const [usageEdits, setUsageEdits] = useState<AiUsageRecord[] | null>(null)
  const usages = useMemo(() => usageEdits ?? defaultAiUsageRecords(locale), [locale, usageEdits])
  const [includeCoi, setIncludeCoi] = useState(false)
  const [draft, setDraft] = useState(
    () =>
      buildAiUsageDeclaration({
        usages: defaultAiUsageRecords(locale),
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
    // The disclosure draft is derived from the usage rows unless the doctor has edited it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(buildAiUsageDeclaration({ usages, includeCoi, language: locale }).draft)
  }, [draftEdited, includeCoi, locale, usages])

  const openDialog = (): void => {
    setOpen(true)
    void window.api.projects
      .list()
      .then((loaded) => setProjects(loaded))
      .catch(() => setProjects([]))
  }

  const chooseProject = (id: string): void => {
    setProjectId(id)
    setSaved(false)
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

  const updateUsage = (index: number, patch: Partial<AiUsageRecord>): void => {
    setUsageEdits((current) => {
      const base = current ?? defaultAiUsageRecords(locale)
      return base.map((usage, usageIndex) =>
        usageIndex === index ? { ...usage, ...patch } : usage
      )
    })
  }

  const rebuild = (): void => {
    setDraftEdited(false)
    setDraft(buildAiUsageDeclaration({ usages, includeCoi, language: locale }).draft)
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
          <h3 className="font-medium">{copy.declarationTitle}</h3>
          {usages.map((usage, index) => (
            <div key={index} className="grid gap-1">
              <input
                aria-label={copy.feature}
                value={usage.feature}
                onChange={(event) => updateUsage(index, { feature: event.target.value })}
              />
              <input
                aria-label={copy.model}
                value={usage.model}
                onChange={(event) => updateUsage(index, { model: event.target.value })}
              />
              <input
                aria-label={copy.purpose}
                value={usage.purpose}
                onChange={(event) => updateUsage(index, { purpose: event.target.value })}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setUsageEdits((current) => [
                ...(current ?? defaultAiUsageRecords(locale)),
                emptyUsage()
              ])
            }
          >
            {copy.addUsage}
          </button>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={includeCoi}
              onChange={(event) => setIncludeCoi(event.target.checked)}
            />
            <span>{copy.coi}</span>
          </label>
          <button type="button" onClick={rebuild}>
            {copy.rebuild}
          </button>
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
          <label className="block">
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
            <div>
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
