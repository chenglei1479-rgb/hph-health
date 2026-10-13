import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ErrorNotice } from '@/components/error-notice'
import { Button } from '@/components/ui/button'
import {
  SCIENTIFIC_STATUSES,
  newScientificItem,
  readScientificRecord,
  saveScientificRecord,
  scientificItemSchema,
  type ScientificItem,
  type ScientificRecord
} from '../../../../shared/scientific-status'

type Props = { projectId: string; readOnly?: boolean }

// Parent keys this component by Project so unsaved edits cannot leak into a different Project.
export const ScientificStatusPanel = ({
  projectId,
  readOnly = false
}: Props): React.JSX.Element => {
  const { t } = useTranslation()
  const labels = {
    'not-executed': t('Not executed'),
    computed: t('Computed'),
    'needs-review': t('Needs researcher review'),
    'data-blocked': t('Blocked by data conditions')
  }
  const [loaded] = useState(() => {
    try {
      return { record: readScientificRecord(window.localStorage, projectId), error: false }
    } catch {
      return { record: undefined, error: true }
    }
  })
  const [record, setRecord] = useState<ScientificRecord>(
    () =>
      loaded.record ?? {
        version: 1,
        projectId,
        updatedAt: 0,
        items: []
      }
  )
  const [editing, setEditing] = useState<ScientificItem>()
  const [error, setError] = useState<'invalid' | 'write'>()
  const save = (): void => {
    if (!editing || readOnly || loaded.error) return
    const parsed = scientificItemSchema.safeParse(editing)
    if (!parsed.success) {
      setError('invalid')
      return
    }
    const next = {
      ...record,
      updatedAt: Date.now(),
      items: record.items.some((item) => item.id === editing.id)
        ? record.items.map((item) => (item.id === editing.id ? parsed.data : item))
        : [...record.items, parsed.data]
    }
    try {
      saveScientificRecord(window.localStorage, next)
      setRecord(next)
      setEditing(undefined)
      setError(undefined)
    } catch {
      setError('write')
    }
  }
  return (
    <details
      className="shrink-0 border-b border-border-200 bg-bg-000 px-4 py-2"
      data-testid="scientific-status-panel"
    >
      <summary className="cursor-pointer text-sm font-medium text-text-100">
        {t('Scientific status')}
        <span className="ml-3 inline-flex flex-wrap gap-2 text-xs font-normal text-text-300">
          {SCIENTIFIC_STATUSES.map((status) => (
            <span key={status}>
              {labels[status]}:{' '}
              {loaded.error ? '—' : record.items.filter((item) => item.status === status).length}
            </span>
          ))}
        </span>
      </summary>
      <div className="mt-3 max-h-[40vh] space-y-3 overflow-y-auto pb-2">
        <p className="text-xs leading-5 text-text-300">
          {t(
            'Researcher-recorded status on this device. It does not grant analysis approval, verify results automatically, or travel with project exports.'
          )}
        </p>
        {loaded.error ? (
          <ErrorNotice
            title={t(
              'Research status could not be loaded. Existing records will not be overwritten.'
            )}
          />
        ) : null}
        {(loaded.error ? [] : record.items).map((item) => (
          <div key={item.id} className="rounded-lg border border-border-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-text-100">{item.title}</span>
              <span className="rounded-md bg-bg-200 px-2 py-1 text-xs text-text-100">
                {labels[item.status]}
              </span>
              <Button
                size="sm"
                variant="outline"
                aria-label={`${t('Edit')}: ${item.title}`}
                disabled={readOnly || loaded.error}
                onClick={() => {
                  setEditing({ ...item })
                  setError(undefined)
                }}
              >
                {t('Edit')}
              </Button>
            </div>
            {item.evidence ? (
              <p className="mt-1 break-words whitespace-pre-wrap text-xs text-text-300">
                {t('Evidence or draft reference')}: {item.evidence}
              </p>
            ) : null}
            {item.status === 'data-blocked' ? (
              <p className="mt-1 break-words whitespace-pre-wrap text-xs text-text-100">
                {t('Missing data condition')}: {item.dataCondition}
              </p>
            ) : null}
            {item.nextStep ? (
              <p className="mt-1 break-words whitespace-pre-wrap text-xs text-text-300">
                {t('Next research action')}: {item.nextStep}
              </p>
            ) : null}
          </div>
        ))}
        {!editing && record.items.length < 20 ? (
          <Button
            variant="outline"
            size="sm"
            disabled={readOnly || loaded.error}
            onClick={() =>
              setEditing(newScientificItem(crypto.randomUUID(), t('New research item')))
            }
          >
            {t('Add research item')}
          </Button>
        ) : null}
        {editing ? (
          <div className="space-y-2 rounded-lg border border-border-200 p-3">
            <label className="block text-xs text-text-100">
              {t('Research item')}
              <input
                className="mt-1 block w-full rounded border border-border-200 bg-bg-000 p-2"
                maxLength={120}
                value={editing.title}
                onChange={(event) => setEditing({ ...editing, title: event.target.value })}
              />
            </label>
            <label className="block text-xs text-text-100">
              {t('Scientific status')}
              <select
                className="mt-1 block w-full rounded border border-border-200 bg-bg-000 p-2"
                value={editing.status}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    status: event.target.value as ScientificItem['status'],
                    outputsChecked: false
                  })
                }
              >
                {SCIENTIFIC_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {labels[status]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-text-100">
              {t('Evidence or draft reference')}
              <textarea
                className="mt-1 block w-full rounded border border-border-200 bg-bg-000 p-2"
                maxLength={2000}
                value={editing.evidence}
                onChange={(event) =>
                  setEditing({ ...editing, evidence: event.target.value, outputsChecked: false })
                }
              />
            </label>
            {editing.status === 'computed' ? (
              <label className="flex gap-2 text-xs text-text-100">
                <input
                  type="checkbox"
                  checked={editing.outputsChecked}
                  onChange={(event) =>
                    setEditing({ ...editing, outputsChecked: event.target.checked })
                  }
                />
                {t('I checked the computation outputs against the cited Run and input version.')}
              </label>
            ) : null}
            {editing.status === 'data-blocked' ? (
              <label className="block text-xs text-text-100">
                {t('Missing data condition')}
                <textarea
                  className="mt-1 block w-full rounded border border-border-200 bg-bg-000 p-2"
                  maxLength={2000}
                  value={editing.dataCondition}
                  onChange={(event) =>
                    setEditing({ ...editing, dataCondition: event.target.value })
                  }
                />
              </label>
            ) : null}
            <label className="block text-xs text-text-100">
              {t('Next research action')}
              <textarea
                className="mt-1 block w-full rounded border border-border-200 bg-bg-000 p-2"
                maxLength={2000}
                value={editing.nextStep}
                onChange={(event) => setEditing({ ...editing, nextStep: event.target.value })}
              />
            </label>
            {error ? (
              <ErrorNotice
                title={
                  error === 'write'
                    ? t('Research status was not saved. Keep this form open and retry.')
                    : t(
                        'Provide a title, checked output evidence for computed results, draft evidence for review, or a missing data condition for blocked work.'
                      )
                }
              />
            ) : null}
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={readOnly || loaded.error}>
                {t('Save')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditing(undefined)
                  setError(undefined)
                }}
              >
                {t('Cancel')}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </details>
  )
}
