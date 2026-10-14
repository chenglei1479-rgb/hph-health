import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { JSONWebKeySet } from 'jose'
import type { SecureStorageCipher } from '../secure-storage'

export type SavedAccountSession = {
  version: 1
  issuer: string
  clientId: string
  subject: string
  idToken: string
  nonce: string
  keys: JSONWebKeySet
  keysFetchedAt: number
  pinnedKeyThumbprints: string[]
  refreshToken?: string
}

// Written only after a live issuer JWKS fetch. A rewritten account-session.enc
// cannot change this pin, so a JWKS planted next to a forged token does not verify.
export type AccountJwksPin = {
  version: 1
  issuer: string
  clientId: string
  thumbprints: string[]
  fetchedAt: number
}

export interface AccountSessionStore {
  read(): SavedAccountSession | undefined
  write(session: SavedAccountSession): void
  readPin(): AccountJwksPin | undefined
  writePin(pin: AccountJwksPin): void
  clear(): void
}

const nonEmptyStrings = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((item) => typeof item === 'string' && item.length > 0)

export const createAccountSessionStore = (
  root: string,
  cipher: SecureStorageCipher
): AccountSessionStore => {
  const file = join(root, 'account-session.enc')
  const pinFile = join(root, 'account-jwks-pin.enc')
  const secure = (): void => {
    if (!cipher.isEncryptionAvailable() || cipher.getSelectedStorageBackend?.() === 'basic_text')
      throw new Error('Secure account storage unavailable.')
  }
  const clearFile = (target: string): void => {
    try {
      unlinkSync(target)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  const readEncrypted = <T>(target: string, accept: (value: T) => boolean): T | undefined => {
    try {
      if (statSync(target).size > 256 * 1024) throw new Error('Invalid account session size.')
      secure()
      const value = JSON.parse(cipher.decryptString(readFileSync(target))) as T
      if (!accept(value)) throw new Error('Invalid account session.')
      return value
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      clearFile(target)
      return undefined
    }
  }
  const writeEncrypted = (target: string, value: unknown): void => {
    secure()
    mkdirSync(root, { recursive: true })
    const temporary = target + '.' + randomBytes(8).toString('hex') + '.tmp'
    let failure: unknown
    try {
      writeFileSync(temporary, cipher.encryptString(JSON.stringify(value)), {
        mode: 0o600,
        flag: 'wx'
      })
      renameSync(temporary, target)
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
  return {
    read() {
      return readEncrypted<SavedAccountSession>(file, (value) =>
        Boolean(
          value &&
          value.version === 1 &&
          ['issuer', 'clientId', 'subject', 'idToken', 'nonce'].every(
            (key) =>
              typeof value[key as keyof SavedAccountSession] === 'string' &&
              Boolean(value[key as keyof SavedAccountSession])
          ) &&
          Array.isArray(value.keys?.keys) &&
          typeof value.keysFetchedAt === 'number' &&
          Number.isFinite(value.keysFetchedAt) &&
          nonEmptyStrings(value.pinnedKeyThumbprints) &&
          (value.refreshToken === undefined ||
            (typeof value.refreshToken === 'string' && value.refreshToken))
        )
      )
    },
    write(session) {
      writeEncrypted(file, session)
    },
    readPin() {
      return readEncrypted<AccountJwksPin>(pinFile, (value) =>
        Boolean(
          value &&
          value.version === 1 &&
          typeof value.issuer === 'string' &&
          value.issuer &&
          typeof value.clientId === 'string' &&
          value.clientId &&
          nonEmptyStrings(value.thumbprints) &&
          typeof value.fetchedAt === 'number' &&
          Number.isFinite(value.fetchedAt)
        )
      )
    },
    writePin(pin) {
      writeEncrypted(pinFile, pin)
    },
    clear() {
      clearFile(file)
      clearFile(pinFile)
    }
  }
}
