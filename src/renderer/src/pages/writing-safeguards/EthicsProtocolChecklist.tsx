import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { R8_ITEMS } from '../../../../shared/ethics-protocol/r8-items'

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
  yes: t('Yes'),
  no: t('No'),
  unknown: t('I don’t know'),
  blank: t('Missing'),
  na: t('Not applicable'),
  reason: t('Reason it does not apply'),
  reasonRequired: t('Enter a reason.'),
  draft: t('Draft'),
  outsourcing: t(
    'Baselio analyzes patient data on your PC and sends only information without direct identifiers (such as column names and aggregate results) to AI services. Check your institution’s rules or ask the ethics committee whether this constitutes outsourcing.'
  )
})

export const EthicsProtocolChecklist = (): React.JSX.Element => {
  const { t } = useTranslation()
  const c = copy(t)
  const [choices, setChoices] = useState<Record<number, Choice>>({})
  const [excluded, setExcluded] = useState<Record<number, boolean>>({})
  const [reasons, setReasons] = useState<Record<number, string>>({})
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
    </section>
  )
}
