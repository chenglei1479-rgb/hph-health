import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { R8_ITEMS } from '../../../../shared/ethics-protocol/r8-items'
import type { EthicsProtocolState } from '../../../../shared/ethics-protocol/state'

type Choice = '' | 'yes' | 'no' | 'unknown'
const conditional = new Set([18, 19, 22, 23, 24])
/* i18n copy uses English source-text keys in the renderer catalog. */
type ChecklistCopy = Record<
  | 'title'
  | 'precedence'
  | 'yes'
  | 'no'
  | 'unknown'
  | 'blank'
  | 'na'
  | 'reason'
  | 'reasonRequired'
  | 'draft'
  | 'outsourcing',
  string
>
const copy = (t: (key: string) => string): ChecklistCopy => ({
  title: t('Research protocol checklist'),
  precedence: t('Your institution’s form and ethics committee requirements take priority.'),
  yes: t('Ethics checklist: yes'),
  no: t('Ethics checklist: no'),
  unknown: t('Ethics checklist: unknown'),
  blank: t('Ethics checklist: missing'),
  na: t('Not applicable'),
  reason: t('Reason it does not apply'),
  reasonRequired: t('Enter a reason.'),
  draft: t('Draft'),
  outsourcing: t(
    'Baselio analyzes patient data on your PC and sends only information without direct identifiers (such as column names and aggregate results) to AI services. Check your institution’s rules or ask the ethics committee whether this constitutes outsourcing.'
  )
})

export const EthicsProtocolChecklist = ({
  projectId
}: {
  projectId: string
}): React.JSX.Element => {
  const { t } = useTranslation()
  const c = copy(t)
  const [choices, setChoices] = useState<Record<number, Choice>>({})
  const [excluded, setExcluded] = useState<Record<number, boolean>>({})
  const [reasons, setReasons] = useState<Record<number, string>>({})
  const [metadata, setMetadata] = useState<
    Pick<EthicsProtocolState, 'confirmedMappings' | 'importedDocxPath'>
  >({ confirmedMappings: [] })
  useEffect(() => {
    if (!projectId || !window.api.writingSafeguards) return
    void window.api.writingSafeguards.getEthicsProtocol({ projectId }).then((protocol) => {
      setChoices(protocol.choices)
      setReasons(protocol.notApplicableReasons)
      setExcluded(
        Object.fromEntries(
          Object.keys(protocol.notApplicableReasons).map((key) => [Number(key), true])
        )
      )
      setMetadata({
        confirmedMappings: protocol.confirmedMappings,
        importedDocxPath: protocol.importedDocxPath
      })
    })
  }, [projectId])
  const save = (): void => {
    if (!projectId || !window.api.writingSafeguards) return
    void window.api.writingSafeguards.setEthicsProtocol({
      projectId,
      protocol: {
        choices,
        notApplicableReasons: reasons,
        confirmedMappings: metadata.confirmedMappings,
        importedDocxPath: metadata.importedDocxPath
      }
    })
  }
  const importDocx = (file: File): void => {
    if (!projectId || !window.api.writingSafeguards) return
    void file.arrayBuffer().then((buffer) =>
      window.api.writingSafeguards.importEthicsDocx({
        projectId,
        fileName: file.name,
        bytes: [...new Uint8Array(buffer)]
      })
    )
  }
  const downloadDraft = (): void => {
    if (!projectId || !window.api.writingSafeguards) return
    void window.api.writingSafeguards
      .exportEthicsDraft({ projectId })
      .then(({ fileName, bytes }) => {
        const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)]))
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = fileName
        anchor.click()
        URL.revokeObjectURL(url)
      })
  }
  return (
    <section aria-label={c.title} className="space-y-2 border-t border-border pt-3">
      <h3 className="font-medium">{c.title}</h3>
      <p>{c.precedence}</p>
      <ol className="space-y-2">
        {R8_ITEMS.map((item) => (
          <li key={item.number} className="rounded border border-border p-2">
            <div>
              <strong>
                {item.number}. {t(item.title)}
              </strong>{' '}
              <span>{c.draft}</span> <span>{c.blank}</span>
            </div>
            {conditional.has(item.number) ? (
              <div role="group" aria-label={`${item.number}`} className="flex gap-2">
                {(['yes', 'no', 'unknown'] as const).map((value) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name={`ethics-${item.number}`}
                      checked={choices[item.number] === value}
                      onChange={() => setChoices((old) => ({ ...old, [item.number]: value }))}
                    />
                    {c[value]}
                  </label>
                ))}
              </div>
            ) : null}
            <label>
              <input
                type="checkbox"
                checked={excluded[item.number] ?? false}
                onChange={(event) =>
                  setExcluded((old) => ({ ...old, [item.number]: event.target.checked }))
                }
              />
              {c.na}
            </label>
            {excluded[item.number] ? (
              <>
                <input
                  aria-label={`${c.reason} ${item.number}`}
                  value={reasons[item.number] ?? ''}
                  onChange={(event) =>
                    setReasons((old) => ({ ...old, [item.number]: event.target.value }))
                  }
                />
                {!reasons[item.number]?.trim() ? (
                  <span role="alert">{c.reasonRequired}</span>
                ) : null}
              </>
            ) : null}
            {item.number === 23 ? <p>{c.outsourcing}</p> : null}
          </li>
        ))}
      </ol>
      <button type="button" disabled={!projectId} onClick={save}>
        {t('Save')}
      </button>
      <label>
        {t('Import institutional DOCX form')}
        <input
          type="file"
          accept=".docx"
          disabled={!projectId}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) importDocx(file)
          }}
        />
      </label>
      <button type="button" disabled={!projectId} onClick={downloadDraft}>
        {t('Download incomplete DOCX draft')}
      </button>
    </section>
  )
}
