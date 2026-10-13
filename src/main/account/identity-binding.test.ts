import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { createIdentityBinding } from './identity-binding'

it('binds issuer and subject atomically, preserves the owner, and rejects corrupt records', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dra-owner-'))
  try {
    const bind = createIdentityBinding(root)
    const first = { issuer: 'https://tenant.auth0.com/', subject: 'user-1' }
    expect(await bind(first)).toBe(true)
    expect(await bind(first)).toBe(true)
    expect(await bind({ ...first, subject: 'user-2' })).toBe(false)
    expect(await bind({ ...first, issuer: 'https://other.auth0.com/' })).toBe(false)
    expect(JSON.parse(await readFile(join(root, 'account-owner.json'), 'utf8'))).toEqual(first)
    await writeFile(join(root, 'account-owner.json'), '{broken')
    await expect(bind(first)).rejects.toThrow()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
