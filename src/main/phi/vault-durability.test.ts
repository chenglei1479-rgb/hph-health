import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { PHI_INTERNAL_CODE } from '../../shared/phi-block'
import { deidentify } from './deidentify'
import {
  PHI_LOG_MAX_EVENTS,
  createEncryptedPhiVault,
  createTestPhiCipher,
  type PhiCipher
} from './store'

// #252: beta.23 rewrote the whole encrypted document on every release, from a snapshot each store()
// had decrypted for itself. Two projects therefore overwrote each other's entries, and a crash or a
// failed write in the middle of save() left a file that could not be decrypted — which closed the gate
// and answered every turn with 503. These tests pin the three properties that make that impossible:
// one shared document, an atomic replace, and a bounded access log.

const tempDirectory = (): string => mkdtempSync(join(tmpdir(), 'dra-phi-vault-'))

const tempFilesIn = (directory: string): string[] =>
  readdirSync(directory).filter((name) => name.endsWith('.tmp'))

describe('encrypted PHI vault durability (#252)', () => {
  it('keeps the entries of a project opened before another project wrote', () => {
    const directory = tempDirectory()
    const cipher = createTestPhiCipher()
    const vault = createEncryptedPhiVault(directory, cipher)
    // Both stores existed before either release, which is what a second project (or a second gate)
    // looks like: each one used to hold its own decrypted snapshot of the document.
    const first = vault.store('project-a')
    const second = vault.store('project-b')

    const a = deidentify('カルテ番号：0083341', first)
    const b = deidentify('カルテ番号：0083342', second)

    // A restart reads the file, not this process's cache: both entries must have been written.
    const reopened = createEncryptedPhiVault(directory, cipher)
    expect(reopened.store('project-a').restore(a.text)).toContain('0083341')
    expect(reopened.store('project-b').restore(b.text)).toContain('0083342')
  })

  it('stays decryptable and complete after twenty releases from stores opened together', () => {
    const directory = tempDirectory()
    const cipher = createTestPhiCipher()
    const vault = createEncryptedPhiVault(directory, cipher)
    const projects = Array.from({ length: 20 }, (_, index) => `project-${index}`)
    const kartes = projects.map((_, index) => `00${String(index).padStart(5, '0')}`)
    const stores = projects.map((project) => ({ project, store: vault.store(project) }))

    const released = stores.map(({ store }, index) => deidentify(`カルテ番号：${kartes[index]}`, store))

    const bytes = readFileSync(vault.filePath)
    const document = JSON.parse(cipher.decryptString(bytes)) as {
      projects: Record<string, { entries: unknown[] }>
    }
    expect(Object.keys(document.projects).sort()).toEqual([...projects].sort())
    for (const project of projects) expect(document.projects[project].entries).toHaveLength(1)

    // Every placeholder is still resolvable from the file alone.
    const reopened = createEncryptedPhiVault(directory, cipher)
    stores.forEach(({ project }, index) => {
      expect(reopened.store(project).restore(released[index].text)).toContain(kartes[index])
    })
    expect(tempFilesIn(directory)).toEqual([])
    expect(bytes.length).toBeLessThan(400_000)
  })

  it('leaves the previous vault byte for byte intact when a write fails', () => {
    const directory = tempDirectory()
    const base = createTestPhiCipher()
    let failing = false
    const cipher: PhiCipher = {
      encryptString(value) {
        if (failing) throw Object.assign(new Error('ENOSPC: no space left on device'), {
          code: 'ENOSPC'
        })
        return base.encryptString(value)
      },
      decryptString: (blob) => base.decryptString(blob)
    }
    const vault = createEncryptedPhiVault(directory, cipher)
    const store = vault.store('project-a')
    store.placeholder('PERSON_NAME', '山田 太郎', '患者')
    const before = readFileSync(vault.filePath)

    failing = true
    expect(() => store.placeholder('PERSON_NAME', '鈴木 花子', '患者')).toThrow('ENOSPC')
    failing = false

    // The failed write must not have replaced or truncated the vault, and must not leave a temp file.
    expect(readFileSync(vault.filePath).equals(before)).toBe(true)
    expect(base.decryptString(readFileSync(vault.filePath))).toContain('山田 太郎')
    expect(tempFilesIn(directory)).toEqual([])

    // The next write still succeeds: a transient failure does not poison the vault.
    const next = deidentify('カルテ番号：0099900', store)
    expect(next.text).not.toContain('0099900')
    expect(base.decryptString(readFileSync(vault.filePath))).toContain('0099900')
  })

  it('rejects a re-entrant write without touching the vault or leaving a temp file', () => {
    const directory = tempDirectory()
    const base = createTestPhiCipher()
    let reenter: (() => void) | null = null
    const cipher: PhiCipher = {
      encryptString(value) {
        // The cipher is the one place a second save can start while the first is still open: it runs
        // inside save(), after the lock is taken and before the temp file exists.
        if (reenter) {
          const run = reenter
          reenter = null
          run()
        }
        return base.encryptString(value)
      },
      decryptString: (blob) => base.decryptString(blob)
    }
    const vault = createEncryptedPhiVault(directory, cipher)
    const store = vault.store('project-a')
    store.placeholder('PERSON_NAME', '山田 太郎', '患者')
    const before = readFileSync(vault.filePath)

    reenter = () => store.placeholder('PERSON_NAME', '鈴木 花子', '患者')
    let error: unknown
    try {
      store.placeholder('PERSON_NAME', '佐藤 次郎', '患者')
    } catch (caught) {
      error = caught
    }

    // Two writers on one vault is a programming error, not a retryable condition: it must be typed and
    // fail closed, and it must not have written anything on the way to the error.
    expect((error as { code?: string }).code).toBe(PHI_INTERNAL_CODE)
    expect(String((error as Error).message)).toContain('already in progress')
    expect(readFileSync(vault.filePath).equals(before)).toBe(true)
    expect(tempFilesIn(directory)).toEqual([])
  })

  it('bounds the access log and records how many events it dropped', () => {
    const directory = tempDirectory()
    const cipher = createTestPhiCipher()
    const vault = createEncryptedPhiVault(directory, cipher)
    const store = vault.store('project-a')

    for (let index = 0; index < PHI_LOG_MAX_EVENTS + 50; index += 1) store.log('deidentify', {})

    const log = vault.readLog()
    expect(log.length).toBeLessThanOrEqual(PHI_LOG_MAX_EVENTS + 1)
    const trimmed = log.filter((event) => event.action === 'log-trimmed')
    expect(trimmed.length).toBeGreaterThan(0)
    const dropped = trimmed.reduce((total, event) => total + (event.counts.dropped ?? 0), 0)
    expect(dropped).toBeGreaterThan(0)
    // Trimming must be recorded, not silent: the marker is what a reader sees instead of the tail.
    expect(log.some((event) => event.action === 'deidentify')).toBe(true)
    // The whole point of the bound: the file stays small enough to rewrite on every release.
    expect(readFileSync(vault.filePath).length).toBeLessThan(400_000)
  })
})
