import { mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import {
  createAccountSessionStore,
  type SavedAccountSession,
  type AccountSessionStore
} from './session-store'
import type { SecureStorageCipher } from '../secure-storage'
const roots: string[] = []
const fixture = (): {
  root: string
  cipher: SecureStorageCipher
  session: SavedAccountSession
  store: AccountSessionStore
  file: string
} => {
  const root = mkdtempSync(join(tmpdir(), 'dra-session-'))
  roots.push(root)
  const key = randomBytes(32)
  const cipher = {
    isEncryptionAvailable: () => true,
    encryptString(value: string) {
      const iv = randomBytes(12),
        encrypt = createCipheriv('aes-256-gcm', key, iv)
      const body = Buffer.concat([encrypt.update(value, 'utf8'), encrypt.final()])
      return Buffer.concat([iv, encrypt.getAuthTag(), body])
    },
    decryptString(value: Buffer) {
      const decrypt = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12))
      decrypt.setAuthTag(value.subarray(12, 28))
      return Buffer.concat([decrypt.update(value.subarray(28)), decrypt.final()]).toString('utf8')
    }
  }
  const session: SavedAccountSession = {
    version: 1,
    issuer: 'https://tenant.auth0.com/',
    clientId: 'client',
    subject: 'owner',
    idToken: 'sensitive-id-token',
    nonce: 'nonce',
    keys: { keys: [] },
    refreshToken: 'sensitive-refresh-token'
  }
  return {
    root,
    cipher,
    session,
    store: createAccountSessionStore(root, cipher),
    file: join(root, 'account-session.enc')
  }
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
it('persists only ciphertext, atomically replaces rotated tokens and clears on logout', () => {
  const f = fixture()
  f.store.write(f.session)
  expect(readFileSync(f.file).includes(Buffer.from('sensitive'))).toBe(false)
  expect(createAccountSessionStore(f.root, f.cipher).read()).toEqual(f.session)
  f.store.write({ ...f.session, refreshToken: 'rotated' })
  expect(f.store.read()?.refreshToken).toBe('rotated')
  f.store.clear()
  f.store.clear()
  expect(existsSync(f.file)).toBe(false)
})
it('fails closed on corrupted or plaintext files', () => {
  const f = fixture()
  f.store.write(f.session)
  const data = readFileSync(f.file)
  data[data.length - 1] ^= 1
  writeFileSync(f.file, data)
  expect(f.store.read()).toBeUndefined()
  expect(existsSync(f.file)).toBe(false)
  writeFileSync(f.file, JSON.stringify(f.session))
  expect(f.store.read()).toBeUndefined()
})
it('never falls back to plaintext when secure storage is unavailable', () => {
  const f = fixture()
  expect(() =>
    createAccountSessionStore(f.root, { ...f.cipher, isEncryptionAvailable: () => false }).write(
      f.session
    )
  ).toThrow('unavailable')
  expect(() =>
    createAccountSessionStore(f.root, {
      ...f.cipher,
      getSelectedStorageBackend: () => 'basic_text'
    }).write(f.session)
  ).toThrow('unavailable')
  expect(existsSync(f.file)).toBe(false)
})
