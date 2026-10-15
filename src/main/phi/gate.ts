import { englishNativeTranslator, type NativeTranslator } from '../locale/main-process-messages'
import { formatUnapprovedBlock } from './approval'
import {
  applyManualSpans,
  previewFromResult,
  highlightTokens,
  type PhiConfirmDecision,
  type PhiConfirmer,
  type PhiHighlight,
  type PhiPreview,
  type PhiSpanMark
} from './confirm'
import { deidentify, type PhiReplacement, type PhiResult } from './deidentify'
import { detectPhi, type PhiCategory, type PhiSpan } from './detect'
import { createMemoryPhiVault, type PhiStore } from './store'

export interface PhiBlockedSpan {
  start: number
  end: number
  category: PhiCategory
  text: string
}

export class PhiGateError extends Error {
  readonly spans: readonly PhiBlockedSpan[]

  constructor(message: string, spans: readonly PhiBlockedSpan[] = []) {
    super(message)
    this.name = 'PhiGateError'
    this.spans = spans
  }
}

const PATIENT_PHI = new Set<PhiCategory>([
  'PERSON_NAME',
  'DATE',
  'ADDRESS',
  'PHONE',
  'EMAIL',
  'FACILITY',
  'KARTE_NO',
  'INSURER_NO',
  'INSURED_ID',
  'MY_NUMBER'
])

interface PhiGate {
  release(text: string, projectId: string): PhiResult
  restore(text: string, projectId: string): string
  manual?(original: string, projectId: string): string
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
  },
  manual(original, projectId) {
    return memoryStore(projectId).manual(original)
  }
}

let gate: PhiGate = memoryGate
let confirmer: PhiConfirmer | null = null
let machineApproved: () => boolean = () => false
let blockTranslator: NativeTranslator = englishNativeTranslator
let activeProjectId = 'default'
const warnings = new Map<string, string[]>()

export function installPhiGate(next: PhiGate): void {
  gate = next
}

// Production installs a window confirmer. Unit tests leave this unset and therefore do not prompt.
// Once installed, a dismissed or failed review blocks the send.
export function installPhiConfirmer(next: PhiConfirmer | null): void {
  confirmer = next
}

// Production reads the append-only machine declaration. No declaration means not approved.
export function installMachineApproval(next: (() => boolean) | null): void {
  machineApproved = next ?? (() => false)
}

export function installMachineApprovalTranslator(next: NativeTranslator): void {
  blockTranslator = next
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
    restore: (text, projectId) => open(projectId).restore(text),
    manual: (original, projectId) => open(projectId).manual(original)
  }
}

export function createClosedGate(message: string): PhiGate {
  return {
    release() {
      throw new PhiGateError(message)
    },
    restore() {
      throw new PhiGateError(message)
    },
    manual() {
      throw new PhiGateError(message)
    }
  }
}

function failClosed(error: unknown): never {
  if (error instanceof PhiGateError) throw error
  throw new PhiGateError(
    error instanceof Error ? error.message : 'PHI gate failed closed. The request was not sent.'
  )
}

function contained(inner: PhiSpan, outer: PhiSpan): boolean {
  return (
    inner !== outer &&
    inner.start >= outer.start &&
    inner.end <= outer.end &&
    (inner.start > outer.start || inner.end < outer.end)
  )
}

function patientSpans(text: string): PhiBlockedSpan[] {
  const detected = detectPhi(text).filter((span) => PATIENT_PHI.has(span.category))
  return detected
    .filter((span) => !detected.some((other) => contained(span, other)))
    .map((span) => ({
      start: span.start,
      end: span.end,
      category: span.category,
      text: span.text
    }))
}

function assertMachineMaySend(texts: readonly string[]): void {
  let approved = false
  try {
    approved = machineApproved()
  } catch {
    approved = false
  }
  if (approved) return
  const grouped = texts.map((text) => patientSpans(text))
  const spans = grouped.flat()
  if (spans.length === 0) return
  const lines = grouped.flatMap((found, index) =>
    found.map((span) => {
      const where = texts.length > 1 ? `#${index + 1} ` : ''
      return `${where}${span.category} [${span.start}, ${span.end}]: ${span.text}`
    })
  )
  const translate = blockTranslator
  throw new PhiGateError(formatUnapprovedBlock(lines, translate), spans)
}

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    out.push(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out)
    return
  }
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) collectStrings(child, out)
  }
}

function releasedPreview(text: string, projectId: string): PhiPreview {
  const result = gate.release(text, projectId)
  if (result.warnings.length > 0) warnings.set(projectId, result.warnings)
  if (result.replacements.length === 0) return { text: result.text, highlights: [] }
  return previewFromResult(text, result.replacements)
}

async function review(preview: PhiPreview, projectId: string): Promise<string> {
  if (!confirmer) return preview.text
  let decision: PhiConfirmDecision
  try {
    decision = await confirmer(preview)
  } catch (error) {
    failClosed(error)
  }
  if (!decision?.confirmed) {
    throw new PhiGateError('PHI review was dismissed. The request was not sent.')
  }
  const extras = decision.extraSpans ?? []
  if (extras.length === 0) return preview.text
  try {
    return applyManualSpans(preview.text, extras, (original) => {
      if (!gate.manual) {
        throw new Error('PHI review cannot store a manual redaction. The request was not sent.')
      }
      return gate.manual(original, projectId)
    })
  } catch (error) {
    failClosed(error)
  }
}

export async function releaseModelText(text: string, projectId: string): Promise<string> {
  try {
    notePhiProject(projectId)
    assertMachineMaySend([text])
    return await review(releasedPreview(text, projectId), projectId)
  } catch (error) {
    failClosed(error)
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

interface PreparedBlock {
  block: unknown
  text: string | null
  previewStart: number
  highlights: PhiHighlight[]
}

export async function releasePromptContent<T>(content: T, projectId: string): Promise<T> {
  try {
    notePhiProject(projectId)
    if (typeof content === 'string') return (await releaseModelText(content, projectId)) as T
    if (!Array.isArray(content)) {
      throw new PhiGateError('PHI gate cannot scan this prompt. The request was not sent.')
    }
    assertMachineMaySend(
      content.map((block) => blockText(block)).filter((text): text is string => text != null)
    )
    const prepared: PreparedBlock[] = []
    const segments: string[] = []
    let cursor = 0
    for (const block of content) {
      const text = blockText(block)
      if (text == null) {
        prepared.push({ block, text: null, previewStart: 0, highlights: [] })
        continue
      }
      const preview = releasedPreview(text, projectId)
      if (segments.length > 0) cursor += 1
      prepared.push({
        block: preview.text === text ? block : { ...(block as PromptBlock), text: preview.text },
        text: preview.text,
        previewStart: cursor,
        highlights: preview.highlights
      })
      segments.push(preview.text)
      cursor += preview.text.length
    }
    const preview: PhiPreview = {
      text: segments.join('\n'),
      highlights: prepared.flatMap((item) =>
        item.text == null
          ? []
          : item.highlights.map((highlight) => ({
              ...highlight,
              start: highlight.start + item.previewStart,
              end: highlight.end + item.previewStart
            }))
      )
    }
    const decision = await decisionFor(preview)
    if (!decision.confirmed) {
      throw new PhiGateError('PHI review was dismissed. The request was not sent.')
    }
    const extras = new Map<number, PhiSpanMark[]>()
    for (const span of decision.extraSpans ?? []) {
      const index = prepared.findIndex(
        (item) =>
          item.text != null &&
          span.start >= item.previewStart &&
          span.end <= item.previewStart + item.text.length
      )
      if (index < 0) {
        throw new PhiGateError('A marked span crossed a block boundary. The request was not sent.')
      }
      const owner = prepared[index]
      const local = {
        start: span.start - owner.previewStart,
        end: span.end - owner.previewStart
      }
      const list = extras.get(index) ?? []
      list.push(local)
      extras.set(index, list)
    }
    return prepared.map((item, index) => {
      const marks = extras.get(index)
      if (!marks || item.text == null) return item.block
      const text = redact(item.text, marks, projectId)
      return { ...(item.block as PromptBlock), text }
    }) as T
  } catch (error) {
    failClosed(error)
  }
}

async function decisionFor(preview: PhiPreview): Promise<PhiConfirmDecision> {
  if (!confirmer) return { confirmed: true }
  try {
    const decision = await confirmer(preview)
    return decision?.confirmed === true ? decision : { confirmed: false }
  } catch (error) {
    failClosed(error)
  }
}

function redact(text: string, spans: readonly PhiSpanMark[], projectId: string): string {
  return applyManualSpans(text, spans, (original) => {
    if (!gate.manual) {
      throw new Error('PHI review cannot store a manual redaction. The request was not sent.')
    }
    return gate.manual(original, projectId)
  })
}

function blockText(block: unknown): string | null {
  if (!block || typeof block !== 'object') return null
  const record = block as PromptBlock
  return typeof record.text === 'string' ? record.text : null
}

export async function guardProviderBody(
  body: BodyInit | null | undefined
): Promise<BodyInit | null | undefined> {
  if (body == null) return body
  if (typeof body !== 'string') {
    throw new PhiGateError('PHI gate cannot scan this request body. The request was not sent.')
  }
  const projectId = currentPhiProject()
  notePhiProject(projectId)
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return releaseModelText(body, projectId)
  }
  try {
    const texts: string[] = []
    collectStrings(parsed, texts)
    assertMachineMaySend(texts)
    const tokens: PhiReplacement[] = []
    const walked = walkRelease(parsed, projectId, tokens)
    const text = JSON.stringify(walked)
    const reviewed = await review({ text, highlights: highlightTokens(text, tokens) }, projectId)
    JSON.parse(reviewed)
    return reviewed
  } catch (error) {
    failClosed(error)
  }
}

export const CONNECTOR_PATIENT_QUERY_MESSAGE =
  '検索語に患者情報が含まれているため、送信しませんでした。患者情報を除いてやり直してください。 This search was not sent because it appears to contain patient information. Remove the patient information and try again.'

const CONNECTOR_QUERY_KEYS = new Set([
  'query',
  'q',
  'term',
  'terms',
  'keyword',
  'keywords',
  'search',
  'phenotype',
  'article',
  'author',
  'material',
  'text',
  'file_name'
])

// Hard-refuse patient information in connector search text. Unlike model release, this does not
// deidentify or wait for machine approval: the query is not sent.
export function refusePatientQuery(text: string): void {
  const spans = patientSpans(text).filter((span) => !isWholeQueryNameGuess(text, span))
  if (spans.length === 0) return
  throw new PhiGateError(CONNECTOR_PATIENT_QUERY_MESSAGE, spans)
}

// detectPhi treats an entire short Japanese string as a personal name. Disease and literature
// queries are that shape, so a connector search ignores only that whole-string guess. Labeled
// names and structured identifiers still refuse the request.
function isWholeQueryNameGuess(text: string, span: PhiBlockedSpan): boolean {
  if (span.category !== 'PERSON_NAME') return false
  const trimmed = text.trim()
  if (span.text !== trimmed) return false
  return !/患者|氏名|さん|Pt:|キーパーソン|長男|長女|娘の/.test(text)
}

export function refuseConnectorQueryArgs(args: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(args)) {
    if (!CONNECTOR_QUERY_KEYS.has(key) || typeof value !== 'string') continue
    refusePatientQuery(value)
  }
}

export function refuseConnectorQueryUrl(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return
  }
  for (const [key, value] of parsed.searchParams) {
    if (!CONNECTOR_QUERY_KEYS.has(key)) continue
    refusePatientQuery(value)
  }
}

function walkRelease(value: unknown, projectId: string, tokens: PhiReplacement[]): unknown {
  if (typeof value === 'string') {
    const result = gate.release(value, projectId)
    if (result.warnings.length > 0) warnings.set(projectId, result.warnings)
    tokens.push(...result.replacements)
    return result.text
  }
  if (Array.isArray(value)) return value.map((item) => walkRelease(item, projectId, tokens))
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      next[key] = walkRelease(child, projectId, tokens)
    }
    return next
  }
  return value
}
