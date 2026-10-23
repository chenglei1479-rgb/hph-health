// Beta terms of use are a local, per-user acknowledgement. The version is a code constant: changing
// the terms (or how they are presented) bumps it, and every completed install must acknowledge the
// current version once at startup. Nothing here is uploaded or telemetered.
export const BETA_TERMS_VERSION = '2026-10-β1'

export type BetaTermsAcceptance = {
  version: string
  acceptedAt: number
}

// Settings.json is untrusted input. Keep only a usable acknowledgement; a malformed record is
// treated exactly like "not accepted" so the gate stays closed instead of crashing startup.
export const normalizeBetaTermsAcceptance = (value: unknown): BetaTermsAcceptance | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const version = typeof record.version === 'string' ? record.version.trim() : ''
  const acceptedAt =
    typeof record.acceptedAt === 'number' &&
    Number.isFinite(record.acceptedAt) &&
    record.acceptedAt >= 0
      ? record.acceptedAt
      : undefined
  if (version === '' || acceptedAt === undefined) return undefined
  return { version, acceptedAt }
}

export const hasCurrentBetaTermsAcceptance = (
  acceptance: BetaTermsAcceptance | undefined
): boolean => acceptance?.version === BETA_TERMS_VERSION

// English source keys for the terms copy. Renderer catalogs provide the translations; keeping the
// list here keeps the wizard step, the startup gate, and the printable copy from drifting apart.
export const BETA_TERMS_COPY = {
  title: 'Beta terms of use',
  intro:
    'Baselio is an unsigned internal test build for the beta period. You may use it only if you agree to the following terms.',
  sections: [
    {
      title: 'Unsigned internal test build',
      body: 'This is an unsigned internal test build. Do not use it for medical care, diagnosis, or any other clinical decision.'
    },
    {
      title: 'Personal computer only',
      body: 'Install and use Baselio only on your personal computer. Do not install it on a hospital computer.'
    },
    {
      title: 'Fictitious or de-identified data only',
      body: 'Use only fictitious data or data from which identifying information has already been removed.'
    },
    {
      title: 'Where your input is sent',
      body: 'Your input is sent to the AI service you configure. The AI service provider bills you directly for usage. Your API key is stored on this computer.'
    },
    {
      title: 'Beta defects',
      body: 'During the beta, defects and changes to behavior may occur. Do not rely on this build for critical work.'
    }
  ],
  acknowledgement: 'I agree to the terms above.',
  requiredHint: 'Select the checkbox above to continue.',
  agreeAndContinue: 'Agree and continue',
  openPrintable: 'Open the printable full version',
  print: 'Print',
  save: 'Save a copy',
  close: 'Close'
} as const
