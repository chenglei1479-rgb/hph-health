import { deidentify, type PhiResult } from './deidentify'
import { createMemoryPhiVault, type PhiStore } from './store'

export class PhiGateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PhiGateError'
  }
}

interface PhiGate {
  release(text: string, projectId: string): PhiResult
  restore(text: string, projectId: string): string
}

const memory = createMemoryPhiVault()
const memoryStores = new Map<string, PhiStore>()

function memoryStore(projectId: string): PhiStore {
  const existing = memoryStores.get(projectId)
  if (existing) return existing
  const store = memory.store(projectId)
  memoryStores.set(projectId, store)
  return store
}

const memoryGate: PhiGate = {
  release(text, projectId) {
    return deidentify(text, memoryStore(projectId))
  },
  restore(text, projectId) {
    return memoryStore(projectId).restore(text)
  }
}

let gate: PhiGate = memoryGate
let activeProjectId = 'default'
const warnings = new Map<string, string[]>()

export function installPhiGate(next: PhiGate): void {
  gate = next
}

export function notePhiProject(projectId: string): void {
  activeProjectId = projectId
}

export function currentPhiProject(): string {
  return activeProjectId
}

export function phiWarnings(projectId: string): readonly string[] {
  return warnings.get(projectId) ?? []
}

export function createVaultBackedGate(vault: { store(projectId: string): PhiStore }): PhiGate {
  const stores = new Map<string, PhiStore>()
  const open = (projectId: string): PhiStore => {
    const existing = stores.get(projectId)
    if (existing) return existing
    const store = vault.store(projectId)
    stores.set(projectId, store)
    return store
  }
  return {
    release: (text, projectId) => deidentify(text, open(projectId)),
    restore: (text, projectId) => open(projectId).restore(text)
  }
}

export function createClosedGate(message: string): PhiGate {
  return {
    release() {
      throw new PhiGateError(message)
    },
    restore() {
      throw new PhiGateError(message)
    }
  }
}

export function releaseModelText(text: string, projectId: string): string {
  try {
    notePhiProject(projectId)
    const result = gate.release(text, projectId)
    if (result.warnings.length > 0) warnings.set(projectId, result.warnings)
    return result.text
  } catch (error) {
    throw new PhiGateError(
      error instanceof Error ? error.message : 'PHI gate failed closed. The request was not sent.'
    )
  }
}

export function restoreModelText(text: string, projectId = activeProjectId): string {
  try {
    return gate.restore(text, projectId)
  } catch (error) {
    throw new PhiGateError(
      error instanceof Error
        ? error.message
        : 'PHI restore failed closed. The output was not shown.'
    )
  }
}

export function restoreModelValue<T>(value: T, projectId = activeProjectId): T {
  return walk(value, projectId) as T
}

function walk(value: unknown, projectId: string): unknown {
  if (typeof value === 'string') return restoreModelText(value, projectId)
  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item) => {
      const child = walk(item, projectId)
      if (child !== item) changed = true
      return child
    })
    return changed ? next : value
  }
  if (value && typeof value === 'object') {
    let changed = false
    const next: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      const restored = walk(child, projectId)
      if (restored !== child) changed = true
      next[key] = restored
    }
    return changed ? next : value
  }
  return value
}

type PromptBlock = { readonly type?: string; readonly text?: string; readonly content?: unknown }

export function releasePromptContent<T>(content: T, projectId: string): T {
  if (typeof content === 'string') return releaseModelText(content, projectId) as T
  if (!Array.isArray(content)) return content
  return content.map((block) => releaseBlock(block, projectId)) as T
}

function releaseBlock(block: unknown, projectId: string): unknown {
  if (!block || typeof block !== 'object') return block
  const record = block as PromptBlock
  if (typeof record.text !== 'string') return block
  const text = releaseModelText(record.text, projectId)
  return text === record.text ? block : { ...record, text }
}

export function guardProviderBody(body: BodyInit | null | undefined): BodyInit | null | undefined {
  if (body == null) return body
  if (typeof body !== 'string') {
    throw new PhiGateError('PHI gate cannot scan this request body. The request was not sent.')
  }
  const projectId = currentPhiProject()
  try {
    const parsed: unknown = JSON.parse(body)
    const walked = walkRelease(parsed, projectId)
    return JSON.stringify(walked)
  } catch (error) {
    if (error instanceof PhiGateError) throw error
    return releaseModelText(body, projectId)
  }
}

function walkRelease(value: unknown, projectId: string): unknown {
  if (typeof value === 'string') return releaseModelText(value, projectId)
  if (Array.isArray(value)) return value.map((item) => walkRelease(item, projectId))
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) next[key] = walkRelease(child, projectId)
    return next
  }
  return value
}
