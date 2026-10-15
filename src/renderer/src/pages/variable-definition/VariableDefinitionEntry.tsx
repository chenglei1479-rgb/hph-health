import { useState } from 'react'

import { useLocaleStore } from '@/stores/locale-store'

import type { Project } from '../../../../shared/projects'
import type { VariableDefinitionTable } from '../../../../shared/variable-definition'
import { variableDefinitionCopy } from './copy'

const planFromProject = (project: Project): string =>
  [project.name, project.description, project.agentContext]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0)
    .join('\n\n')

const downloadWorkbook = (filename: string, xlsxBase64: string): void => {
  const bytes = Uint8Array.from(atob(xlsxBase64), (char) => char.charCodeAt(0))
  const url = URL.createObjectURL(
    new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
  )
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export const VariableDefinitionEntry = (): React.JSX.Element => {
  const locale = useLocaleStore((state) => state.locale)
  const copy = variableDefinitionCopy(locale)
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const [plan, setPlan] = useState('')
  const [table, setTable] = useState<VariableDefinitionTable | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const openDialog = (): void => {
    setOpen(true)
    void window.api.projects
      .list()
      .then((loaded) => setProjects(loaded))
      .catch(() => setProjects([]))
  }

  const chooseProject = (id: string): void => {
    setProjectId(id)
    const project = projects.find((item) => item.id === id)
    if (project) setPlan(planFromProject(project))
  }

  const generate = (): void => {
    setBusy(true)
    setMessage('')
    void window.api.variableDefinition
      .generate({ projectId: projectId || 'draft', researchPlan: plan })
      .then((next) => setTable(next))
      .catch((error: unknown) => {
        setTable(null)
        setMessage(error instanceof Error ? error.message : copy.empty)
      })
      .finally(() => setBusy(false))
  }

  const exportTemplate = (): void => {
    if (!table) return
    setBusy(true)
    void window.api.variableDefinition
      .exportTemplate({ table })
      .then((file) => downloadWorkbook(file.filename, file.xlsxBase64))
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : copy.empty)
      })
      .finally(() => setBusy(false))
  }

  return (
    <div className="pointer-events-none fixed bottom-3 left-3 z-40">
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
          className="pointer-events-auto mt-2 w-[36rem] max-w-[calc(100vw-1.5rem)] space-y-3 rounded-md border border-border bg-background p-4 text-sm text-foreground shadow-lg"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-medium">{copy.title}</h2>
              <p className="mt-1 text-muted-foreground">{copy.intro}</p>
              <p className="mt-1 text-muted-foreground">{copy.maskingCheckNote}</p>
              <p className="mt-1 text-muted-foreground">{copy.separated}</p>
            </div>
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
            <span>{copy.plan}</span>
            <textarea
              className="mt-1 h-28 w-full rounded-md border border-border bg-background px-2 py-1"
              value={plan}
              onChange={(event) => setPlan(event.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || plan.trim().length === 0}
              onClick={generate}
              className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground disabled:opacity-50"
            >
              {copy.generate}
            </button>
            <button
              type="button"
              disabled={busy || !table}
              onClick={exportTemplate}
              className="rounded-md border border-border px-3 py-1.5 disabled:opacity-50"
            >
              {copy.exportTemplate}
            </button>
          </div>
          {message ? <p role="alert">{message}</p> : null}
          {table && table.warnings.length > 0 ? (
            <ul aria-label={copy.warnings}>
              {table.warnings.map((warning) => (
                <li key={`${warning.code}:${warning.name}`}>{warning.message}</li>
              ))}
            </ul>
          ) : null}
          {table ? (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr>
                  <th>{copy.name}</th>
                  <th>{copy.definition}</th>
                  <th>{copy.recordType}</th>
                  <th>{copy.coding}</th>
                  <th>{copy.type}</th>
                  <th>{copy.allowedRange}</th>
                </tr>
              </thead>
              <tbody>
                {table.variables.map((variable) => (
                  <tr key={variable.name}>
                    <td>{variable.name}</td>
                    <td>{variable.definition}</td>
                    <td>{variable.recordType}</td>
                    <td>{variable.coding}</td>
                    <td>{variable.type}</td>
                    <td>{variable.allowedRange}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
