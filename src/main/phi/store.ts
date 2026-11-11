import { highlightTokens, type PhiHighlight } from './confirm'
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { PhiCategory } from './detect'
import { PHI_INTERNAL_CODE, PHI_UNAVAILABLE_CODE, PhiPolicyError } from '../../shared/phi-block'
import { patientDateOffset } from './dates'

// One vocabulary for vault assignment and recognition of opaque substitutions.
export const PHI_PLACEHOLDER_LABELS = {
  PERSON_NAME: '患者',
  PHYSICIAN_NAME: '職員',
  DATE: '日付',
  ADDRESS: '住所',
  PHONE: '電話',
  EMAIL: 'メール',
  FACILITY: '施設',
  KARTE_NO: '番号',
  INSURER_NO: '番号',
  INSURED_ID: '番号',
  MY_NUMBER: '番号',
  AGE: '年齢',
  MANUAL: '追記'
} as const satisfies Record<PhiCategory | 'AGE' | 'MANUAL', string>

const OPAQUE_PLACEHOLDER = new RegExp(
  `^\\[(?:${[...new Set(Object.values(PHI_PLACEHOLDER_LABELS))]
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})\\d+\\]$`,
  'u'
)

export const isPhiPlaceholder = (text: string): boolean => OPAQUE_PLACEHOLDER.test(text)

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
  category: PhiCategory | 'MANUAL'
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
  manual(original: string): string
  dateOffset(patientPseudonym: string): number
  rememberShift(shifted: string, original: string): void
  restore(text: string): string
  highlights(text: string): PhiHighlight[]
  log(action: string, counts: Record<string, number>): void
}

export function normalizeIdentifier(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim()
}

function emptyDocument(): VaultDocument {
  return { version: 1, projects: {}, log: [] }
}

// #252: the access log is a diagnostic trail, not an unbounded record. In beta.23 it grew without a
// bound — every released string appended an event, and every append rewrote and re-encrypted the whole
// document, so the file reached 2.37 MB and a failure inside save() closed the gate for every turn.
// Two thousand events of roughly sixty bytes each keep the file near 120 KB while retaining the tail
// of a session, which is what the incident reports need.
export const PHI_LOG_MAX_EVENTS = 2_000
const LOG_TRIMMED_ACTION = 'log-trimmed'
// No project owns a log trim; the marker is about the vault itself.
const LOG_TRIMMED_PROJECT = '-'

// Dropping old events must not be silent: exactly one marker records how many have been dropped in
// total. It is removed before every trim and re-added with the accumulated count, so it can never
// crowd out the events it describes — a single marker sitting above the retained tail. Trimming keeps
// one slot free for it (`PHI_LOG_MAX_EVENTS - 1` events plus the marker).
function trimLog(document: VaultDocument): void {
  const existing = document.log.findIndex(
    (event) => event.action === LOG_TRIMMED_ACTION && event.projectId === LOG_TRIMMED_PROJECT
  )
  let dropped = 0
  if (existing >= 0) {
    dropped = document.log[existing].counts.dropped ?? 0
    document.log.splice(existing, 1)
  }
  const budget = PHI_LOG_MAX_EVENTS - 1
  const overflow = document.log.length - budget
  if (overflow > 0) {
    document.log.splice(0, overflow)
    dropped += overflow
  }
  if (dropped > 0) {
    document.log.unshift({
      at: new Date().toISOString(),
      projectId: LOG_TRIMMED_PROJECT,
      action: LOG_TRIMMED_ACTION,
      counts: { dropped }
    })
  }
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

  manual(original: string): string {
    const normalized = normalizeIdentifier(original)
    const hmac = createHmac('sha256', Buffer.from(this.record.key, 'base64'))
      .update(`MANUAL\0${normalized}`)
      .digest('hex')
    const existing = this.record.entries.find((entry) => entry.hmac === hmac)
    if (existing) return existing.placeholder
    const label = PHI_PLACEHOLDER_LABELS.MANUAL
    const next = (this.record.counters[label] ?? 0) + 1
    this.record.counters[label] = next
    const placeholder = placeholderFor(label, next)
    this.record.entries.push({ hmac, category: 'MANUAL', label, placeholder, original })
    this.persist('manual', { MANUAL: 1 })
    return placeholder
  }

  dateOffset(patientPseudonym: string): number {
    return patientDateOffset(Buffer.from(this.record.key, 'base64'), patientPseudonym)
  }

  rememberShift(shifted: string, original: string): void {
    if (shifted === original) return
    const existing = this.record.shifts.find((item) => item.shifted === shifted)
    if (existing && existing.original !== original) {
      // Internal invariant, not patient information: two dates mapped to the same shifted value.
      // Typed so the gate can keep the class; the message here is a diagnostic, never user copy.
      throw new PhiPolicyError(
        'PHI date shift collided. The request was not sent.',
        PHI_INTERNAL_CODE
      )
    }
    if (!existing) this.record.shifts.push({ shifted, original })
    this.persist('shift', {})
  }

  highlights(text: string): PhiHighlight[] {
    return highlightTokens(text, [
      ...this.record.entries.map((entry) => ({
        replacement: entry.placeholder,
        category: entry.category
      })),
      ...this.record.shifts.map((shift) => ({
        replacement: shift.shifted,
        category: 'DATE' as const
      }))
    ])
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
    trimLog(document)
    persist()
  }
  return new ProjectStore(record, (action, counts) => {
    document.log.push({ at: new Date().toISOString(), projectId, action, counts: { ...counts } })
    trimLog(document)
    persist()
  })
}

// A narrow seam over the five filesystem calls the vault makes. Production passes Node's own functions.
// The durability tests inject a failure *at* the write or at the rename, which is the only way to reach
// the temp-file cleanup branch: a cipher that throws fails before the temp file exists.
export type PhiVaultFileSystem = {
  mkdirSync: typeof mkdirSync
  readFileSync: typeof readFileSync
  writeFileSync: typeof writeFileSync
  renameSync: typeof renameSync
  rmSync: typeof rmSync
}

const NODE_VAULT_FILE_SYSTEM: PhiVaultFileSystem = {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync
}

export function createEncryptedPhiVault(
  directory: string,
  cipher: PhiCipher,
  fileSystem: PhiVaultFileSystem = NODE_VAULT_FILE_SYSTEM
): {
  store(projectId: string): PhiStore
  readLog(): PhiAccessEvent[]
  filePath: string
} {
  fileSystem.mkdirSync(directory, { recursive: true })
  const filePath = join(directory, 'vault.bin')
  // #252: one document per vault, shared by every store(). Before this, each store() call decrypted the
  // file again and kept its own snapshot, so two projects (or two gates) could each write back a copy
  // that did not contain the other's entries — a lost update, and the reason concurrent releases all
  // rewrote the whole file. Loading once also means a store cannot be built from a stale snapshot.
  //
  // This assumes ONE vault instance per directory: two instances (two app processes over the same
  // profile, or a second install) each hold their own document and would overwrite each other's
  // entries. Production installs exactly one per app run (`production-gate.ts`), and the settings file
  // keeps the app single-instance; a second instance must not point at the same phi-vault directory.
  let document: VaultDocument | null = null
  let writes = 0
  const load = (): VaultDocument => {
    try {
      const blob = fileSystem.readFileSync(filePath)
      const parsed: unknown = JSON.parse(cipher.decryptString(blob))
      if (!parsed || typeof parsed !== 'object') return emptyDocument()
      return parsed as VaultDocument
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyDocument()
      throw new PhiPolicyError(
        'PHI vault cannot be decrypted. Model requests are blocked.',
        PHI_UNAVAILABLE_CODE
      )
    }
  }
  const current = (): VaultDocument => (document ??= load())
  // One write at a time, per vault. The write is synchronous on purpose: a failed write must fail the
  // release (fail-closed), so it cannot be deferred to a queue that swallows the error. This flag turns
  // a re-entrant call into a typed PHI error instead of two writers on the same temp file; it is a
  // property of the vault, not something a caller has to arrange.
  let writing = false
  const save = (): void => {
    if (writing) {
      throw new PhiPolicyError(
        'PHI vault write is already in progress. The request was not sent.',
        PHI_INTERNAL_CODE
      )
    }
    writing = true
    try {
      const blob = cipher.encryptString(JSON.stringify(current()))
      // Temp file + rename: at every moment the disk holds either the previous complete vault or the
      // new one. A crash, ENOSPC or EBUSY in the middle leaves the previous vault readable rather than
      // a half-written file that cannot be decrypted (which is what closes the gate for every turn).
      const tempPath = `${filePath}.${process.pid}.${++writes}.tmp`
      try {
        fileSystem.writeFileSync(tempPath, blob, { mode: 0o600 })
        fileSystem.renameSync(tempPath, filePath)
      } catch (error) {
        // The original vault is untouched; remove the partial temp file so a retry starts clean.
        try {
          fileSystem.rmSync(tempPath, { force: true })
        } catch {
          // Leaving a temp file behind is better than masking the write error.
        }
        throw error
      }
    } finally {
      writing = false
    }
  }
  return {
    filePath,
    store(projectId) {
      return openProject(current(), projectId, save)
    },
    readLog() {
      return current().log
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
