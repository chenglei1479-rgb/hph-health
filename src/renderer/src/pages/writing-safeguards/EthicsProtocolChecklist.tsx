import { useState } from 'react'
import type { Locale } from '../../../../shared/locale'
import { R8_ITEMS } from '../../../../shared/ethics-protocol/r8-items'

type Choice = '' | 'yes' | 'no' | 'unknown'
const conditional = new Set([18, 19, 22, 23, 24])
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
const copy = (locale: Locale): ChecklistCopy =>
  locale === 'ja'
    ? {
        title: '研究計画書チェックリスト',
        precedence: '所属機関の書式と倫理審査委員会の要求が優先されます',
        yes: 'はい',
        no: 'いいえ',
        unknown: 'わからない',
        blank: '空缺',
        na: '該当なし',
        reason: '該当しない理由',
        reasonRequired: '理由を入力してください',
        draft: '草案',
        outsourcing:
          'Baselio では患者データの分析はお使いの PC 内で行い、AI サービスには直接識別子を含まない情報（列名・集計結果など）を送信します。委託に該当するかどうかは、所属機関の規程または倫理審査委員会にご確認ください。'
      }
    : locale === 'zh-Hans'
      ? {
          title: '研究计划书检查清单',
          precedence: '所属机构的格式和伦理审查委员会要求优先',
          yes: '是',
          no: '否',
          unknown: '不知道',
          blank: '空缺',
          na: '不适用',
          reason: '不适用理由',
          reasonRequired: '请填写理由',
          draft: '草稿',
          outsourcing:
            'Baselio 在您的电脑内分析患者数据，仅向 AI 服务发送不含直接标识符的信息（如列名和汇总结果）。是否属于委托，请确认所属机构规定或咨询伦理审查委员会。'
        }
      : {
          title: 'Research protocol checklist',
          precedence: 'Your institution’s form and ethics committee requirements take priority.',
          yes: 'Yes',
          no: 'No',
          unknown: 'I don’t know',
          blank: 'Missing',
          na: 'Not applicable',
          reason: 'Reason it does not apply',
          reasonRequired: 'Enter a reason.',
          draft: 'Draft',
          outsourcing:
            'Baselio analyzes patient data on your PC and sends only information without direct identifiers (such as column names and aggregate results) to AI services. Check your institution’s rules or ask the ethics committee whether this constitutes outsourcing.'
        }

export const EthicsProtocolChecklist = ({ locale }: { locale: Locale }): React.JSX.Element => {
  const c = copy(locale)
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
                {item.number}. {item.title}
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
