import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useLocaleStore } from '@/stores/locale-store'

import { ErrorNotice } from '../../components/error-notice'
import type { ModelRequirementCheck } from '../../../../shared/model-requirement'
import type { Project } from '../../../../shared/projects'
import type { VariableDefinitionTable } from '../../../../shared/variable-definition'
import {
  variableDefinitionCopy,
  variableDefinitionPanelMessage,
  variableDefinitionWarningText
} from './copy'

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
  const { t } = useTranslation()
  const copy = variableDefinitionCopy(locale)
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const [plan, setPlan] = useState('')
  const [table, setTable] = useState<VariableDefinitionTable | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  // #134: the model requirement is checked before the form exists, not after a failed submit.
  const [availability, setAvailability] = useState<ModelRequirementCheck | 'checking'>('checking')

  const checkAvailability = (): void => {
    setAvailability('checking')
    // A window without the preload bridge has nothing to ask; that is "could not read", which the
    // panel can offer to retry, not "no provider configured", which it cannot.
    const probe = window.api.variableDefinition?.getAvailability
    if (!probe) {
      setAvailability({ status: 'unavailable', code: 'model-requirement-settings-unreadable' })
      return
    }
    void probe()
      .then((check) => setAvailability(check))
      .catch(() =>
        setAvailability({
          status: 'unavailable',
          code: 'model-requirement-settings-unreadable'
        })
      )
  }

  // One next step per state: "add a provider", "pick a model", "retry the read", or "fix the
  // provider's key". A single "not available" sentence would send every case to the same place.
  const requirementDescription = (check: ModelRequirementCheck): string => {
    if (check.status === 'not-configured') {
      return check.missing === 'provider'
        ? t(
            'No model provider is configured. Add an OpenAI or Azure OpenAI provider in Settings > Models, then come back here.'
          )
        : t(
            'The selected provider has no model. Choose a model in Settings > Models, then come back here.'
          )
    }
    if (check.status === 'unavailable') {
      return check.code === 'model-requirement-settings-unreadable'
        ? t(
            'The model settings could not be read. Try again; if it keeps failing, open Settings > Models.'
          )
        : t(
            'The provider configured in Settings cannot be used here. Check its key and model in Settings > Models, then try again.'
          )
    }
    return ''
  }

  const openDialog = (): void => {
    setOpen(true)
    checkAvailability()
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
        setMessage(
          error instanceof Error
            ? variableDefinitionPanelMessage(locale, error.message)
            : copy.empty
        )
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
        setMessage(
          error instanceof Error
            ? variableDefinitionPanelMessage(locale, error.message)
            : copy.empty
        )
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
          {availability === 'checking' ? (
            <p role="status" data-variable-definition-checking>
              {t('Checking whether this feature can run…')}
            </p>
          ) : null}
          {availability !== 'checking' && availability.status !== 'ready' ? (
            <ErrorNotice
              level="warning"
              title={t('Variable definitions need a configured model.')}
              description={requirementDescription(availability)}
              errorCode={availability.status === 'unavailable' ? availability.code : undefined}
              diagnosticsLabel={t('Diagnostics')}
              primaryButton={{ label: t('Recheck'), onClick: checkAvailability }}
            />
          ) : null}
          {availability !== 'checking' && availability.status === 'ready' ? (
            <>
              <p className="text-muted-foreground" data-variable-definition-model>
                {t('Model: {{provider}} / {{model}}', {
                  provider: availability.providerLabel,
                  model: availability.modelId
                })}
              </p>
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
                    <li key={`${warning.code}:${warning.name}`}>
                      {variableDefinitionWarningText(locale, warning)}
                    </li>
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
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
