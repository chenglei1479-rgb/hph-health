import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { R8_ITEMS, type R8ItemNumber } from '../../../../shared/ethics-protocol/r8-items'
import type { EthicsProtocolState } from '../../../../shared/ethics-protocol/state'
import { confirmHeadingMapping } from '../../../../shared/ethics-protocol/heading-mapper'
import {
  evaluateR8ItemCompleteness,
  formatNotApplicableText
} from '../../../../shared/ethics-protocol/completeness'

type ConditionalItemNumber = keyof EthicsProtocolState['choices']
const conditional: ReadonlySet<R8ItemNumber> = new Set([18, 19, 22, 23, 24])
const isConditional = (number: R8ItemNumber): number is ConditionalItemNumber =>
  conditional.has(number)
/* i18n copy uses English source-text keys in the renderer catalog. */
type ChecklistCopy = Record<
  | 'title'
  | 'precedence'
  | 'yes'
  | 'no'
  | 'unknown'
  | 'blank'
  | 'partial'
  | 'na'
  | 'reason'
  | 'reasonRequired'
  | 'draft'
  | 'outsourcing'
  | 'mappingTitle'
  | 'mappingDoctor'
  | 'mappingSelect'
  | 'mappingUnknown'
  | 'mappingConfirm'
  | 'sectionContent',
  string
>
const copy = (t: (key: string, options?: { context: string }) => string): ChecklistCopy => ({
  title: t('Research protocol checklist'),
  precedence: t('Your institution’s form and ethics committee requirements take priority.'),
  yes: t('Yes', { context: 'ethics' }),
  no: t('No', { context: 'ethics' }),
  unknown: t('I don’t know', { context: 'ethics' }),
  blank: t('Missing', { context: 'ethics' }),
  partial: t('Partially missing'),
  na: t('Not applicable'),
  reason: t('Reason it does not apply'),
  reasonRequired: t('Enter a reason.'),
  draft: t('Draft'),
  mappingTitle: t('Institutional heading mappings'),
  mappingDoctor: t('Confirming doctor'),
  mappingSelect: t('Select checklist item'),
  mappingUnknown: t('Mapping unknown'),
  mappingConfirm: t('Confirm heading mappings'),
  sectionContent: t('Protocol section content'),
  outsourcing: t(
    'Pre-send checks and restrictions help prevent sending direct identifiers such as names and patient IDs. This is not an absolute guarantee.'
  )
})

export const EthicsProtocolChecklist = ({
  projectId
}: {
  projectId: string
}): React.JSX.Element => {
  const { t } = useTranslation()
  const c = copy(t)
  const [choices, setChoices] = useState<EthicsProtocolState['choices']>({})
  const [excluded, setExcluded] = useState<Record<number, boolean>>({})
  const [reasons, setReasons] = useState<EthicsProtocolState['notApplicableReasons']>({})
  const [sectionTexts, setSectionTexts] = useState<
    NonNullable<EthicsProtocolState['sectionTexts']>
  >({})
  const [metadata, setMetadata] = useState<
    Pick<EthicsProtocolState, 'confirmedMappings' | 'headingCandidates' | 'importedDocxPath'>
  >({ confirmedMappings: [] })
  const [mappingSelections, setMappingSelections] = useState<Record<string, string>>({})
  const [confirmingDoctor, setConfirmingDoctor] = useState('')
  const itemStatus = (number: R8ItemNumber): '空缺' | '部分空缺' | '記載あり' => {
    const reason = reasons[number]?.trim()
    if (reason) return evaluateR8ItemCompleteness(number, formatNotApplicableText(number, reason))
    if (excluded[number] && number >= 16) {
      return evaluateR8ItemCompleteness(number, '該当なし')
    }
    if (!isConditional(number)) {
      return evaluateR8ItemCompleteness(number, sectionTexts[number] ?? '')
    }
    const answer = choices[number]
    return evaluateR8ItemCompleteness(
      number,
      answer === 'yes' ? 'はい' : answer === 'no' ? 'いいえ' : ''
    )
  }
  useEffect(() => {
    if (!projectId || !window.api.writingSafeguards) return
    void window.api.writingSafeguards.getEthicsProtocol({ projectId }).then((protocol) => {
      setChoices(protocol.choices)
      setReasons(protocol.notApplicableReasons)
      setSectionTexts(protocol.sectionTexts ?? {})
      setExcluded(
        Object.fromEntries(
          [
            ...(protocol.notApplicableItems ?? []),
            ...Object.keys(protocol.notApplicableReasons).map(Number)
          ].map((number) => [number, true])
        )
      )
      setMetadata({
        confirmedMappings: protocol.confirmedMappings,
        headingCandidates: protocol.headingCandidates,
        importedDocxPath: protocol.importedDocxPath
      })
      setMappingSelections(
        Object.fromEntries(
          (protocol.headingCandidates ?? []).map((candidate) => [
            candidate.heading,
            String(
              protocol.confirmedMappings.find(({ heading }) => heading === candidate.heading)
                ?.item ??
                candidate.item ??
                ''
            )
          ])
        )
      )
    })
  }, [projectId])
  const save = (): void => {
    if (!projectId || !window.api.writingSafeguards) return
    void window.api.writingSafeguards.setEthicsProtocol({
      projectId,
      protocol: {
        choices,
        sectionTexts,
        notApplicableItems: Object.entries(excluded).flatMap(([number, checked]) =>
          checked ? [Number(number) as R8ItemNumber] : []
        ),
        notApplicableReasons: reasons,
        confirmedMappings: metadata.confirmedMappings,
        headingCandidates: metadata.headingCandidates,
        importedDocxPath: metadata.importedDocxPath
      }
    })
  }
  const importDocx = (file: File): void => {
    if (!projectId || !window.api.writingSafeguards) return
    void file.arrayBuffer().then((buffer) =>
      window.api.writingSafeguards
        .importEthicsDocx({
          projectId,
          fileName: file.name,
          bytes: [...new Uint8Array(buffer)]
        })
        .then(({ headingCandidates }) => {
          setMetadata((old) => ({ ...old, headingCandidates }))
          setMappingSelections(
            Object.fromEntries(
              headingCandidates.map((candidate) => [
                candidate.heading,
                String(candidate.item ?? '')
              ])
            )
          )
        })
    )
  }
  const confirmMappings = (): void => {
    const doctor = confirmingDoctor.trim()
    if (!doctor) return
    const confirmedAt = new Date().toISOString()
    const confirmedMappings = (metadata.headingCandidates ?? []).flatMap((candidate) => {
      const item = Number(mappingSelections[candidate.heading])
      return item >= 1 && item <= 25
        ? [confirmHeadingMapping(candidate, item as R8ItemNumber, doctor, confirmedAt)]
        : []
    })
    const protocol = {
      choices,
      sectionTexts,
      notApplicableItems: Object.entries(excluded).flatMap(([number, checked]) =>
        checked ? [Number(number) as R8ItemNumber] : []
      ),
      notApplicableReasons: reasons,
      confirmedMappings,
      headingCandidates: metadata.headingCandidates,
      importedDocxPath: metadata.importedDocxPath
    }
    setMetadata((old) => ({ ...old, confirmedMappings }))
    void window.api.writingSafeguards.setEthicsProtocol({ projectId, protocol })
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
              <span>{c.draft}</span>{' '}
              {itemStatus(item.number) !== '記載あり' ? (
                <span data-ethics-missing={item.number}>
                  {itemStatus(item.number) === '部分空缺' ? c.partial : c.blank}
                </span>
              ) : null}
            </div>
            {isConditional(item.number) ? (
              <div role="group" aria-label={`${item.number}`} className="flex gap-2">
                {(['yes', 'no', 'unknown'] as const).map((value) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name={`ethics-${item.number}`}
                      checked={choices[item.number as ConditionalItemNumber] === value}
                      onChange={() => setChoices((old) => ({ ...old, [item.number]: value }))}
                    />
                    {c[value]}
                  </label>
                ))}
              </div>
            ) : (
              <textarea
                aria-label={`${c.sectionContent} ${item.number}`}
                value={sectionTexts[item.number] ?? ''}
                onChange={(event) =>
                  setSectionTexts((old) => ({ ...old, [item.number]: event.target.value }))
                }
              />
            )}
            <label>
              <input
                type="checkbox"
                checked={excluded[item.number] ?? false}
                onChange={(event) => {
                  const checked = event.target.checked
                  setExcluded((old) => ({ ...old, [item.number]: checked }))
                  if (!checked) {
                    setReasons((old) => {
                      const next = { ...old }
                      delete next[item.number]
                      return next
                    })
                  }
                }}
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
      {metadata.headingCandidates?.length ? (
        <fieldset className="space-y-2">
          <legend>{c.mappingTitle}</legend>
          <label>
            {c.mappingDoctor}
            <input
              value={confirmingDoctor}
              onChange={(event) => setConfirmingDoctor(event.target.value)}
            />
          </label>
          {metadata.headingCandidates.map((candidate) => (
            <label key={candidate.heading} className="block">
              {candidate.heading}
              <select
                aria-label={`${c.mappingSelect}: ${candidate.heading}`}
                value={mappingSelections[candidate.heading] ?? candidate.item ?? ''}
                onChange={(event) =>
                  setMappingSelections((old) => ({
                    ...old,
                    [candidate.heading]: event.target.value
                  }))
                }
              >
                <option value="">{c.mappingUnknown}</option>
                {R8_ITEMS.map((item) => (
                  <option key={item.number} value={item.number}>
                    {item.number}. {t(item.title)}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button type="button" disabled={!confirmingDoctor.trim()} onClick={confirmMappings}>
            {c.mappingConfirm}
          </button>
        </fieldset>
      ) : null}
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
