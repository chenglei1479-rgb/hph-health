import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  verifyCitations,
  type CitationCheck,
  type CitationMismatchField
} from '../../../shared/citation-verification'

const STATUS_LABEL = {
  verified: 'Citation verified',
  mismatch: 'Citation mismatch',
  'not-found': 'Citation not found',
  unverified: 'Citation unverified'
} as const

const MISMATCH_LABEL: Record<CitationMismatchField, string> = {
  title: 'Title does not match the publisher record.',
  author: 'Author does not match the publisher record.',
  year: 'Year does not match the publisher record.'
}

const CitationVerificationStrip = ({
  text,
  verify = verifyCitations
}: {
  text: string
  verify?: typeof verifyCitations
}): React.JSX.Element | null => {
  const { t } = useTranslation()
  const [checks, setChecks] = useState<CitationCheck[] | undefined>()
  const verifyRef = useRef(verify)

  useEffect(() => {
    verifyRef.current = verify
  }, [verify])

  useEffect(() => {
    let cancelled = false
    void verifyRef.current(text).then((next) => {
      if (!cancelled) setChecks(next)
    })
    return () => {
      cancelled = true
    }
  }, [text])

  if (!checks || checks.length === 0) return null

  return (
    <ul
      aria-label={t('Citation checks')}
      className="mt-2 flex flex-col gap-1"
      data-testid="citation-checks"
    >
      {checks.map((check) => (
        <li key={`${check.kind}:${check.id}`} className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-text-200">
            {check.kind === 'pmid' ? `PMID ${check.id}` : `DOI ${check.id}`}
          </span>
          <span
            className={
              check.status === 'verified'
                ? 'text-status-success'
                : check.status === 'unverified'
                  ? 'text-muted-foreground'
                  : 'text-status-failure'
            }
          >
            {t(STATUS_LABEL[check.status])}
          </span>
          {check.mismatches?.map((field) => (
            <span key={field} className="text-muted-foreground">
              {t(MISMATCH_LABEL[field])}
            </span>
          ))}
        </li>
      ))}
    </ul>
  )
}

export { CitationVerificationStrip }
