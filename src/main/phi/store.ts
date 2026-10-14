import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { PhiCategory } from './detect'
import { patientDateOffset } from './dates'

export interface PhiCipher {
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

export interface PhiAccessEvent {
  at: string
  projectId: string
  action: string
  counts: Record<string, number>
}

interface VaultEntry {
  hmac: string
  category: PhiCategory
  label: string
  placeholder: string
  original: string
}

interface ProjectRecord {
  key: string
  counters: Record<string, number>
  entries: VaultEntry[]
  shifts: Array<{ shifted: string; original: string }>
}

interface VaultDocument {
  version: 1
  projects: Record<string, ProjectRecord>
  log: PhiAccessEvent[]
}

export interface PhiStore {
  placeholder(category: PhiCategory, original: string, label: string): string
  dateOffset(patientPseudonym: string): number
  rememberShift(shifted: string, original: string): void
  restore(text: string): string
  log(action: string, counts: Record<string, number>): void
}

export function normalizeIdentifier(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim()
}

function emptyDocument(): VaultDocument {
  return { version: 1, projects: {}, log: [] }
}

function placeholderFor(label: string, n: number): string {
  return `[${label}${n}]`
}

class ProjectStore implements PhiStore {
  constructor(
    private readonly record: ProjectRecord,
    private readonly persist: (action: string, counts: Record<string, number>) => void
  ) {}

  placeholder(category: PhiCategory, original: string, label: string): string {
    const normalized = normalizeIdentifier(original)
    const hmac = createHmac('sha256', Buffer.from(this.record.key, 'base64'))
      .update(`${category}\0${normalized}`)
      .digest('hex')
    const existing = this.record.entries.find((entry) => entry.hmac === hmac)
    if (existing) return existing.placeholder
    const next = (this.record.counters[label] ?? 0) + 1
    this.record.counters[label] = next
    const placeholder = placeholderFor(label, next)
    this.record.entries.push({ hmac, category, label, placeholder, original })
    this.persist('assign', { [category]: 1 })
    return placeholder
  }

  dateOffset(patientPseudonym: string): number {
    return patientDateOffset(Buffer.from(this.record.key, 'base64'), patientPseudonym)
  }

  rememberShift(shifted: string, original: string): void {
    if (shifted === original) return
    const existing = this.record.shifts.find((item) => item.shifted === shifted)
    if (existing && existing.original !== original) {
      throw new Error('PHI date shift collided. The request was not sent.')
    }
    if (!existing) this.record.shifts.push({ shifted, original })
    this.persist('shift', {})
  }

  restore(text: string): string {
    const tokens = [
      ...this.record.entries.map((entry) => ({ from: entry.placeholder, to: entry.original })),
      ...this.record.shifts.map((item) => ({ from: item.shifted, to: item.original }))
    ].sort((a, b) => b.from.length - a.from.length)
    let restored = text
    for (const token of tokens) {
      if (!token.from || !restored.includes(token.from)) continue
      restored = restored.split(token.from).join(token.to)
    }
    return restored
  }

  log(action: string, counts: Record<string, number>): void {
    this.persist(action, counts)
  }
}

export function createMemoryPhiVault(options?: { key?: Buffer }): {
  store(projectId: string): PhiStore
  readLog(): PhiAccessEvent[]
} {
  const document = emptyDocument()
  return {
    store: (projectId) => openProject(document, projectId, () => undefined, options?.key),
    readLog: () => document.log.map((event) => ({ ...event, counts: { ...event.counts } }))
  }
}

function openProject(
  document: VaultDocument,
  projectId: string,
  persist: () => void,
  key?: Buffer
): PhiStore {
  let record = document.projects[projectId]
  if (!record) {
    record = {
      key: (key ?? randomBytes(32)).toString('base64'),
      counters: {},
      entries: [],
      shifts: []
    }
    document.projects[projectId] = record
    document.log.push({
      at: new Date().toISOString(),
      projectId,
      action: 'create-key',
      counts: {}
    })
    persist()
  }
  return new ProjectStore(record, (action, counts) => {
    document.log.push({ at: new Date().toISOString(), projectId, action, counts: { ...counts } })
    persist()
  })
}

export function createEncryptedPhiVault(
  directory: string,
  cipher: PhiCipher
): {
  store(projectId: string): PhiStore
  readLog(): PhiAccessEvent[]
  filePath: string
} {
  mkdirSync(directory, { recursive: true })
  const filePath = join(directory, 'vault.bin')
  const load = (): VaultDocument => {
    try {
      const blob = readFileSync(filePath)
      const parsed: unknown = JSON.parse(cipher.decryptString(blob))
      if (!parsed || typeof parsed !== 'object') return emptyDocument()
      return parsed as VaultDocument
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyDocument()
      throw new Error('PHI vault cannot be decrypted. Model requests are blocked.')
    }
  }
  const save = (document: VaultDocument): void => {
    const blob = cipher.encryptString(JSON.stringify(document))
    writeFileSync(filePath, blob, { mode: 0o600 })
  }
  return {
    filePath,
    store(projectId) {
      const document = load()
      return openProject(document, projectId, () => save(document))
    },
    readLog() {
      return load().log
    }
  }
}

// Test helper. AES-256-GCM so a fixture name is not recoverable from the file bytes.
export function createTestPhiCipher(secret = 'dra-phi-test'): PhiCipher {
  const key = createHmac('sha256', 'dra-phi-test-cipher').update(secret).digest()
  return {
    encryptString(value) {
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
      const tag = cipher.getAuthTag()
      return Buffer.concat([iv, tag, ciphertext])
    },
    decryptString(blob) {
      const iv = blob.subarray(0, 12)
      const tag = blob.subarray(12, 28)
      const ciphertext = blob.subarray(28)
      const decipher = createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
    }
  }
}
