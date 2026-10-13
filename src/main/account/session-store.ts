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
  refreshToken?: string
}
export interface AccountSessionStore {
  read(): SavedAccountSession | undefined
  write(session: SavedAccountSession): void
  clear(): void
}

export const createAccountSessionStore = (
  root: string,
  cipher: SecureStorageCipher
): AccountSessionStore => {
  const file = join(root, 'account-session.enc')
  const secure = (): void => {
    if (!cipher.isEncryptionAvailable() || cipher.getSelectedStorageBackend?.() === 'basic_text')
      throw new Error('Secure account storage unavailable.')
  }
  const clear = (): void => {
    try {
      unlinkSync(file)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  return {
    read() {
      try {
        if (statSync(file).size > 256 * 1024) throw new Error('Invalid account session size.')
        secure()
        const value = JSON.parse(cipher.decryptString(readFileSync(file))) as SavedAccountSession
        if (
          !value ||
          value.version !== 1 ||
          !['issuer', 'clientId', 'subject', 'idToken', 'nonce'].every(
            (key) =>
              typeof value[key as keyof SavedAccountSession] === 'string' &&
              Boolean(value[key as keyof SavedAccountSession])
          ) ||
          !Array.isArray(value.keys?.keys) ||
          (value.refreshToken !== undefined &&
            (typeof value.refreshToken !== 'string' || !value.refreshToken))
        )
          throw new Error('Invalid account session.')
        return value
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
        clear()
        return undefined
      }
    },
    write(session) {
      secure()
      mkdirSync(root, { recursive: true })
      const temporary = file + '.' + randomBytes(8).toString('hex') + '.tmp'
      let failure: unknown
      try {
        writeFileSync(temporary, cipher.encryptString(JSON.stringify(session)), {
          mode: 0o600,
          flag: 'wx'
        })
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
    },
    clear
  }
}
