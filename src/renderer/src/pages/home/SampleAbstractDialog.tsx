import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useLocaleStore } from '@/stores/locale-store'
import { copyLocale } from '../../../../shared/copy-locale'
import { sampleAbstracts } from '../../../../shared/demo-readmission/sample-abstracts'

type SampleLocale = 'ja' | 'zh-Hans' | 'zh-Hant' | 'en'

const sampleLocale = (language?: string): SampleLocale => {
  const locale = copyLocale(language)
  if (locale === 'ja' || locale === 'zh-Hans' || locale === 'zh-Hant') return locale
  return 'en'
}

const downloadSample = (locale: SampleLocale): void => {
  const html = sampleAbstracts.documents[locale].html
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `dra-demo-abstract.${locale}.html`
  link.click()
  URL.revokeObjectURL(url)
}

export const SampleAbstractDialog = ({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}): React.JSX.Element | null => {
  const { t } = useTranslation()
  const locale = useLocaleStore((state) => state.locale)
  const [saved, setSaved] = useState(false)
  if (!open) return null
  const document = sampleAbstracts.documents[sampleLocale(locale)]
  return (
    <div
      role="dialog"
      aria-label={t('Fictional sample abstract')}
      data-testid="sample-abstract-dialog"
      className="fixed inset-0 z-50 overflow-auto bg-black/40 p-4"
    >
      <div className="mx-auto max-w-3xl rounded-2xl bg-[#faf8f2] p-4 text-[#20343a] shadow-card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-medium">{t('Fictional sample abstract')}</h2>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-md border border-[#d5dfdc] bg-white px-3 py-1.5 text-sm"
              onClick={() => {
                downloadSample(sampleLocale(locale))
                setSaved(true)
              }}
            >
              {t('Save this sample')}
            </button>
            <button
              type="button"
              className="rounded-md border border-[#d5dfdc] bg-white px-3 py-1.5 text-sm"
              onClick={onClose}
            >
              {t('Close')}
            </button>
          </div>
        </div>
        {saved ? <p role="status">{t('Sample saved on this device.')}</p> : null}
        {document.pages.map((item) => (
          <section
            key={item.title}
            data-testid="sample-abstract-page"
            className="mt-4 flex min-h-[70vh] flex-col border-t border-[#e4ded2] pt-4"
          >
            <h3 className="text-lg font-medium">{item.title}</h3>
            <p data-testid="sample-abstract-disclaimer" className="mt-2 text-sm font-semibold">
              {item.disclaimer}
            </p>
            <div className="mt-3 flex-1 space-y-2 text-sm leading-6">
              {item.blocks.map((block, index) =>
                block.type === 'p' ? (
                  <p key={`${item.title}-${index}`}>{block.text}</p>
                ) : (
                  <table key={`${item.title}-table`} className="w-full border-collapse text-left">
                    <thead>
                      <tr>
                        {block.headers.map((header) => (
                          <th key={header} className="border border-[#e4ded2] px-2 py-1">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {block.rows.map((row) => (
                        <tr key={row.join('|')}>
                          {row.map((cell, cellIndex) => (
                            <td
                              key={`${row[0]}-${cellIndex}`}
                              className="border border-[#e4ded2] px-2 py-1"
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}
            </div>
            <footer
              data-testid="sample-abstract-footer"
              className="mt-6 border-t border-[#e4ded2] pt-2 text-xs leading-5"
            >
              <p>{item.footerDisclaimer}</p>
              <p>{item.footerMark}</p>
            </footer>
          </section>
        ))}
      </div>
    </div>
  )
}
