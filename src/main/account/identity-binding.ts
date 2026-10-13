import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// A local DRA profile owns one dataset. Never merge identities merely by matching email.
export const createIdentityBinding =
  (root: string) =>
  async (identity: { issuer: string; subject: string }): Promise<boolean> => {
    await mkdir(root, { recursive: true })
    const path = join(root, 'account-owner.json')
    try {
      await writeFile(path, JSON.stringify(identity), { flag: 'wx', mode: 0o600 })
      return true
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST'))
        throw error
    }
    const existing: unknown = JSON.parse(await readFile(path, 'utf8'))
    return Boolean(
      existing &&
      typeof existing === 'object' &&
      'issuer' in existing &&
      'subject' in existing &&
      existing.issuer === identity.issuer &&
      existing.subject === identity.subject
    )
  }
