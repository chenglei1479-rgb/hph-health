import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AccountConsentNotice } from '../../shared/account'

export type AccountConsentRecord = {
  version: string
  acceptedAt: string
}

export interface AccountConsentStore {
  read(): AccountConsentRecord | undefined
  write(record: AccountConsentRecord): void
}

const VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const MAX_NOTICE_BYTES = 64 * 1024

const textField = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max

export const parseAccountConsentNotice = (raw: unknown): AccountConsentNotice => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('Account consent notice is invalid.')
  const value = raw as Record<string, unknown>
  if (typeof value.version !== 'string' || !VERSION.test(value.version))
    throw new Error('Account consent version is invalid.')
  if (
    !textField(value.title, 200) ||
    !textField(value.body, 20_000) ||
    !textField(value.acknowledgement, 500)
  )
    throw new Error('Account consent notice is invalid.')
  return {
    version: value.version,
    title: value.title,
    body: value.body,
    acknowledgement: value.acknowledgement
  }
}

// First readable file wins. A present but invalid notice fails closed.
export const readAccountConsent = (files: string[]): AccountConsentNotice => {
  for (const file of files) {
    let text: string
    try {
      if (statSync(file).size > MAX_NOTICE_BYTES)
        throw new Error('Account consent notice is invalid.')
      text = readFileSync(file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    return parseAccountConsentNotice(JSON.parse(text))
  }
  throw new Error('Account consent notice is missing.')
}

const acceptRecord = (value: unknown): value is AccountConsentRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.version === 'string' &&
    VERSION.test(record.version) &&
    typeof record.acceptedAt === 'string' &&
    !Number.isNaN(Date.parse(record.acceptedAt)) &&
    Object.keys(record).every((key) => key === 'version' || key === 'acceptedAt')
  )
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
        const value: unknown = JSON.parse(readFileSync(file, 'utf8'))
        if (!acceptRecord(value)) throw new Error('Invalid account consent record.')
        return { version: value.version, acceptedAt: value.acceptedAt }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
        remove()
        return undefined
      }
    },
    write(record) {
      if (!acceptRecord(record)) throw new Error('Invalid account consent record.')
      mkdirSync(root, { recursive: true })
      const temporary = file + '.' + randomBytes(8).toString('hex') + '.tmp'
      let failure: unknown
      try {
        writeFileSync(temporary, JSON.stringify(record), { mode: 0o600, flag: 'wx' })
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
