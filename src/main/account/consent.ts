import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AccountConsentNotice } from '../../shared/account'

export type AccountNoticeAcceptance = {
  version: string
  acceptedAt: string
}

// APPI consent and terms of use share one local file. Each pair is optional so a
// version change can refresh one timestamp without discarding the other.
export type AccountAcceptanceRecord = {
  consent?: AccountNoticeAcceptance
  terms?: AccountNoticeAcceptance
}

export interface AccountConsentStore {
  read(): AccountAcceptanceRecord | undefined
  write(record: AccountAcceptanceRecord): void
}

const VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const MAX_NOTICE_BYTES = 64 * 1024

const textField = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max

const parseNotice = (raw: unknown, label: 'consent' | 'terms'): AccountConsentNotice => {
  const name = label === 'consent' ? 'Account consent' : 'Account terms'
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error(`${name} notice is invalid.`)
  const value = raw as Record<string, unknown>
  if (typeof value.version !== 'string' || !VERSION.test(value.version))
    throw new Error(`${name} version is invalid.`)
  if (
    !textField(value.title, 200) ||
    !textField(value.body, 20_000) ||
    !textField(value.acknowledgement, 500)
  )
    throw new Error(`${name} notice is invalid.`)
  return {
    version: value.version,
    title: value.title,
    body: value.body,
    acknowledgement: value.acknowledgement
  }
}

export const parseAccountConsentNotice = (raw: unknown): AccountConsentNotice =>
  parseNotice(raw, 'consent')

const readNotice = (files: string[], label: 'consent' | 'terms'): AccountConsentNotice => {
  const name = label === 'consent' ? 'Account consent' : 'Account terms'
  for (const file of files) {
    let text: string
    try {
      if (statSync(file).size > MAX_NOTICE_BYTES) throw new Error(`${name} notice is invalid.`)
      text = readFileSync(file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    return parseNotice(JSON.parse(text), label)
  }
  throw new Error(`${name} notice is missing.`)
}

// First readable file wins. A present but invalid notice fails closed.
export const readAccountConsent = (files: string[]): AccountConsentNotice =>
  readNotice(files, 'consent')

export const readTermsOfUse = (files: string[]): AccountConsentNotice => readNotice(files, 'terms')

const acceptancePair = (
  version: unknown,
  acceptedAt: unknown
): AccountNoticeAcceptance | 'absent' | 'invalid' => {
  if (version === undefined && acceptedAt === undefined) return 'absent'
  if (
    typeof version === 'string' &&
    VERSION.test(version) &&
    typeof acceptedAt === 'string' &&
    !Number.isNaN(Date.parse(acceptedAt))
  )
    return { version, acceptedAt }
  return 'invalid'
}

const STORED_KEYS = ['version', 'acceptedAt', 'termsVersion', 'termsAcceptedAt']

const parseStoredAcceptance = (value: unknown): AccountAcceptanceRecord | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (Object.keys(record).some((key) => !STORED_KEYS.includes(key))) return undefined
  const consent = acceptancePair(record.version, record.acceptedAt)
  const terms = acceptancePair(record.termsVersion, record.termsAcceptedAt)
  if (consent === 'invalid' || terms === 'invalid') return undefined
  if (consent === 'absent' && terms === 'absent') return undefined
  return {
    consent: consent === 'absent' ? undefined : consent,
    terms: terms === 'absent' ? undefined : terms
  }
}

export const createAccountConsentStore = (root: string): AccountConsentStore => {
  const file = join(root, 'account-consent-record.json')
  const remove = (): void => {
    try {
      unlinkSync(file)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  return {
    read() {
      try {
        if (statSync(file).size > 4096) throw new Error('Invalid account consent record.')
        const value = parseStoredAcceptance(JSON.parse(readFileSync(file, 'utf8')))
        if (!value) throw new Error('Invalid account consent record.')
        return value
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
        remove()
        return undefined
      }
    },
    write(record) {
      const payload: Record<string, string> = {}
      if (record.consent) {
        payload.version = record.consent.version
        payload.acceptedAt = record.consent.acceptedAt
      }
      if (record.terms) {
        payload.termsVersion = record.terms.version
        payload.termsAcceptedAt = record.terms.acceptedAt
      }
      if (!parseStoredAcceptance(payload)) throw new Error('Invalid account consent record.')
      mkdirSync(root, { recursive: true })
      const temporary = file + '.' + randomBytes(8).toString('hex') + '.tmp'
      let failure: unknown
      try {
        writeFileSync(temporary, JSON.stringify(payload), { mode: 0o600, flag: 'wx' })
        renameSync(temporary, file)
      } catch (error) {
        failure = error
      } finally {
        try {
          unlinkSync(temporary)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && failure === undefined)
            failure = error
        }
      }
      if (failure !== undefined) throw failure
    }
  }
}
