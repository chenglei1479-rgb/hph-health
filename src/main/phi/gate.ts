import { AsyncLocalStorage } from 'node:async_hooks'
import { englishNativeTranslator, type NativeTranslator } from '../locale/main-process-messages'
import { formatUnapprovedBlock } from './approval'
import {
  applyManualSpans,
  highlightTokens,
  type PhiConfirmDecision,
  type PhiConfirmer,
  type PhiHighlight,
  type PhiPreview,
  type PhiSpanMark
} from './confirm'
import { deidentify, type PhiReplacement, type PhiResult } from './deidentify'
import { detectPhi, type PhiCategory, type PhiSpan } from './detect'
import type { PhiStore } from './store'
import { hasOnlyOrdinaryLabelPhi, isOrdinaryLabel } from './ordinary-label'

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
  release(text: string, projectId: string): PhiResult | Promise<PhiResult>
  highlights?(text: string, projectId: string): PhiHighlight[]
  restore(text: string, projectId: string): string
  manual?(original: string, projectId: string): string
}

let gate: PhiGate | null = null
let confirmer: PhiConfirmer | null = null
let machineApproved: () => boolean = () => false
let blockTranslator: NativeTranslator = englishNativeTranslator
let activeProjectId = 'default'
// Changes invalidate both pending sends and in-memory turn consent, even if restored later.
let policyRevision = 0
// Each executor invocation owns a fresh scope, including concurrent turns of one session.
const turns = new AsyncLocalStorage<{
  projectId: string
  active: boolean
  isCurrent: () => boolean
  reviews: Map<string, { revision: number; approved: boolean; tokens: Set<string> }>
}>()
export async function withPhiTurn<T>(
  projectId: string,
  isCurrent: () => boolean,
  run: () => Promise<T>
): Promise<T> {
  const turn = { projectId, active: true, isCurrent, reviews: new Map() }
  return turns.run(turn, async () => {
    try {
      return await run()
    } finally {
      turn.active = false
      turn.reviews.clear()
    }
  })
}
// Each interactive review has a deadline; confirmed replacements live only in the active turn.
export const PHI_CONSENT_EXPIRY_MS = 30_000

const warnings = new Map<string, string[]>()

export function installPhiGate(next: PhiGate | null): void {
  policyRevision++
  gate = next
}

export const MODEL_RELEASE_TIMEOUT_MS = 60_000
export const PHI_SEND_CANCELLED_MESSAGE = 'Sending cancelled. Nothing was sent.'
export const MODEL_RELEASE_RETRY_MESSAGE =
  'The privacy check could not finish. Nothing was sent. Please try again.'
export const UNSCANNABLE_MODEL_CONTENT_MESSAGE =
  'This attachment cannot be checked for patient information. Nothing was sent. Use checked text instead.'
export const UNGUARDED_AGENT_MESSAGE =
  'This agent connection cannot check every model request for patient information and is unavailable in beta. Choose an API provider with a checked connection.'

export function modelReleaseError(key = MODEL_RELEASE_RETRY_MESSAGE): PhiGateError {
  const translate = blockTranslator
  const message =
    key === PHI_SEND_CANCELLED_MESSAGE
      ? translate('Sending cancelled. Nothing was sent.')
      : key === UNSCANNABLE_MODEL_CONTENT_MESSAGE
        ? translate(
            'This attachment cannot be checked for patient information. Nothing was sent. Use checked text instead.'
          )
        : key === UNGUARDED_AGENT_MESSAGE
          ? translate(
              'This agent connection cannot check every model request for patient information and is unavailable in beta. Choose an API provider with a checked connection.'
            )
          : translate('The privacy check could not finish. Nothing was sent. Please try again.')
  return new PhiGateError(message)
}

function activeGate(): PhiGate {
  if (!gate) throw modelReleaseError()
  return gate
}

async function releaseThroughInstalledGate(text: string, projectId: string): Promise<PhiResult> {
  try {
    const result = await activeGate().release(text, projectId)
    if (
      !result ||
      typeof result.text !== 'string' ||
      !Array.isArray(result.replacements) ||
      !Array.isArray(result.warnings)
    ) {
      throw modelReleaseError()
    }
    return result
  } catch {
    // Vault/scanner errors can contain local paths. Use one localized retry surface.
    throw modelReleaseError()
  }
}

async function assertModelBoundRelease<T>(operation: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const started = Date.now()
  try {
    activeGate()
    const released = await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(modelReleaseError()), MODEL_RELEASE_TIMEOUT_MS)
      })
    ])
    // A synchronous scanner can delay the timer itself; never authorize its late result.
    if (Date.now() - started >= MODEL_RELEASE_TIMEOUT_MS) throw modelReleaseError()
    return released
  } catch (error) {
    if (error instanceof PhiGateError) throw error
    throw modelReleaseError()
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Automatic release entry: approval and redaction; interactive consent belongs to sending. */
export function assertModelBoundTextReleased(text: string, projectId: string): Promise<string> {
  return assertModelBoundRelease(() =>
    releaseTextImpl(text, turns.getStore()?.projectId ?? projectId)
  )
}

// Production installs a window confirmer. Unit tests leave this unset and therefore do not prompt.
// Once installed, a dismissed or failed review blocks the send.
export function installPhiConfirmer(next: PhiConfirmer | null): void {
  policyRevision++
  confirmer = next
}

// Production reads the append-only machine declaration. No declaration means not approved.
export function installMachineApproval(next: (() => boolean) | null): void {
  policyRevision++
  machineApproved = next ?? (() => false)
}

export function installMachineApprovalTranslator(next: NativeTranslator): void {
  blockTranslator = next
}

export function notePhiProject(projectId: string): void {
  activeProjectId = projectId
}

export function currentPhiProject(): string {
  return turns.getStore()?.projectId ?? activeProjectId
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
    highlights: (text, projectId) => open(projectId).highlights(text),
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
  throw modelReleaseError()
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
    throw modelReleaseError()
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
    for (const [key, child] of Object.entries(value)) {
      out.push(key)
      collectStrings(child, out)
    }
  }
}

async function releaseTextImpl(text: string, projectId: string): Promise<string> {
  try {
    notePhiProject(projectId)
    assertMachineMaySend([text])
    const result = await releaseThroughInstalledGate(text, projectId)
    if (result.warnings.length > 0) warnings.set(projectId, result.warnings)
    return result.text
  } catch (error) {
    failClosed(error)
  }
}

export const releaseModelText = assertModelBoundTextReleased

export function restoreModelText(text: string, projectId = currentPhiProject()): string {
  projectId = turns.getStore()?.projectId ?? projectId
  try {
    return activeGate().restore(text, projectId)
  } catch (error) {
    throw new PhiGateError(
      error instanceof Error
        ? error.message
        : 'PHI restore failed closed. The output was not shown.'
    )
  }
}

export function restoreModelValue<T>(value: T, projectId = currentPhiProject()): T {
  projectId = turns.getStore()?.projectId ?? projectId
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

export function releasePromptContent<T>(content: T, projectId: string): Promise<T> {
  projectId = turns.getStore()?.projectId ?? projectId
  return assertModelBoundRelease(async () => {
    notePhiProject(projectId)
    if (typeof content === 'string') return (await releaseModelText(content, projectId)) as T
    if (!Array.isArray(content)) throw modelReleaseError()
    assertMachineMaySend(
      content.map((block) => blockText(block)).filter((text): text is string => text != null)
    )
    if (content.length === 0) await releaseThroughInstalledGate('', projectId)
    return (await Promise.all(
      content.map(async (block) => {
        const text = blockText(block)
        if (text == null || (block as PromptBlock).type !== 'text')
          throw modelReleaseError(UNSCANNABLE_MODEL_CONTENT_MESSAGE)
        const result = await releaseThroughInstalledGate(text, projectId)
        if (result.warnings.length > 0) warnings.set(projectId, result.warnings)
        return result.text === text ? block : { ...block, text: result.text }
      })
    )) as T
  })
}

async function decisionFor(preview: PhiPreview): Promise<PhiConfirmDecision> {
  if (preview.highlights.length === 0 || !confirmer) return { confirmed: true }
  try {
    const decision = await confirmWithDeadline(preview)
    return decision?.confirmed === true ? decision : { confirmed: false }
  } catch (error) {
    failClosed(error)
  }
}

async function confirmWithDeadline(preview: PhiPreview): Promise<PhiConfirmDecision> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(modelReleaseError()), PHI_CONSENT_EXPIRY_MS)
  try {
    if (!confirmer) throw modelReleaseError()
    const decision = await Promise.race([
      confirmer(preview, controller.signal),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(modelReleaseError()), {
          once: true
        })
      })
    ])
    controller.signal.throwIfAborted()
    return decision
  } finally {
    clearTimeout(timer)
  }
}

function redact(text: string, spans: readonly PhiSpanMark[], projectId: string): string {
  return applyManualSpans(text, spans, (original) => {
    if (!activeGate().manual) {
      throw new Error('PHI review cannot store a manual redaction. The request was not sent.')
    }
    return activeGate().manual!(original, projectId)
  })
}

function blockText(block: unknown): string | null {
  if (!block || typeof block !== 'object') return null
  const record = block as PromptBlock
  return typeof record.text === 'string' ? record.text : null
}

export function guardProviderBody(
  body: BodyInit | null | undefined,
  projectId = currentPhiProject()
): Promise<BodyInit | null | undefined> {
  return assertModelBoundRelease(() =>
    guardProviderBodyImpl(body, turns.getStore()?.projectId ?? projectId)
  )
}

async function guardProviderBodyImpl(
  body: BodyInit | null | undefined,
  projectId: string,
  tokens: PhiReplacement[] = []
): Promise<BodyInit | null | undefined> {
  if (body == null) {
    await assertModelBoundTextReleased('', projectId)
    return body
  }
  if (typeof body !== 'string') {
    throw new PhiGateError('PHI gate cannot scan this request body. The request was not sent.')
  }
  notePhiProject(projectId)
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return releaseModelText(body, projectId)
  }
  try {
    assertScannableModelValue(parsed)
    const texts: string[] = []
    collectStrings(parsed, texts)
    assertMachineMaySend(texts)
    if (texts.length === 0) await releaseThroughInstalledGate('', projectId)
    const walked = await walkRelease(parsed, projectId, tokens)
    const text = JSON.stringify(walked)
    return text
  } catch (error) {
    failClosed(error)
  }
}

/** Automatic preparation never grants consent. Only this actual outbound operation reviews.
 * The immutable released bytes, destination, project and turn remain local to this call.
 * Only confirmed replacement identities are retained, in this active turn and destination.
 */
export function sendPhiChecked<T>(
  body: BodyInit | null | undefined,
  destination: string,
  send: (released: BodyInit | null | undefined) => Promise<T>,
  projectId = currentPhiProject()
): Promise<T> {
  projectId = turns.getStore()?.projectId ?? projectId
  return assertModelBoundRelease(async () => {
    if (!destination) throw modelReleaseError()
    const turn = turns.getStore()
    const assertCurrentTurn = (): void => {
      if (turn && (!turn.active || !turn.isCurrent() || turns.getStore() !== turn))
        throw modelReleaseError()
    }
    assertCurrentTurn()
    const revision = policyRevision
    const installed = activeGate()
    const reviewer = confirmer
    const approvalReader = machineApproved
    const approved = approvalReader()
    const tokens: PhiReplacement[] = []
    const released = await guardProviderBodyImpl(body, projectId, tokens)
    const text = typeof released === 'string' ? released : ''
    // Vault provenance retains marks from earlier preparation and manual masking.
    // Restore only for the local approval check; the restored value is never sent.
    const restoredTexts: string[] = []
    if (typeof released === 'string') collectStrings(JSON.parse(text), restoredTexts)
    assertMachineMaySend(restoredTexts.map((value) => installed.restore(value, projectId)))
    const prior = turn?.reviews.get(destination)
    const confirmed =
      prior?.revision === revision && prior.approved === approved ? prior.tokens : new Set<string>()
    const identity = (value: string, mark: PhiHighlight): string =>
      JSON.stringify([mark.category, value.slice(mark.start, mark.end)])
    // Generalized replacements (e.g. 90歳以上) can share display text across different
    // originals. A fresh replacement must also match its reviewed source identity.
    const replacementIdentities = new Map<string, string[]>()
    for (const token of tokens) {
      const key = JSON.stringify([token.category, token.replacement])
      const sources = replacementIdentities.get(key) ?? []
      sources.push(JSON.stringify([token.category, token.replacement, token.original]))
      replacementIdentities.set(key, sources)
    }
    const highlights = installed.highlights?.(text, projectId) ?? []
    // Custom scanners also contribute their replacements without needing a vault.
    const unique = new Map<string, PhiHighlight>()
    for (const mark of [...highlights, ...highlightTokens(text, tokens)]) {
      unique.set(JSON.stringify([mark.start, mark.end, mark.category]), mark)
    }
    const preview = {
      text,
      highlights: [...unique.values()].filter((mark) => {
        const key = identity(text, mark)
        const sources = replacementIdentities.get(key)
        return sources ? sources.some((source) => !confirmed.has(source)) : !confirmed.has(key)
      })
    }
    assertCurrentTurn()
    const started = Date.now()
    const decision = await decisionFor(preview)
    if (!decision.confirmed) throw modelReleaseError(PHI_SEND_CANCELLED_MESSAGE)
    const reviewed = redact(text, decision.extraSpans ?? [], projectId)
    if (typeof released === 'string') JSON.parse(reviewed)
    const reviewedIdentities = [
      ...preview.highlights.flatMap((mark) => {
        const key = identity(text, mark)
        return [key, ...(replacementIdentities.get(key) ?? [])]
      }),
      ...(installed.highlights?.(reviewed, projectId) ?? []).flatMap((mark) => {
        const replacement = reviewed.slice(mark.start, mark.end)
        return [
          identity(reviewed, mark),
          JSON.stringify([mark.category, replacement, installed.restore(replacement, projectId)])
        ]
      })
    ]
    return () => {
      assertCurrentTurn()
      let stillApproved: boolean
      try {
        stillApproved = approvalReader()
      } catch {
        throw modelReleaseError()
      }
      if (
        Date.now() - started >= PHI_CONSENT_EXPIRY_MS ||
        policyRevision !== revision ||
        gate !== installed ||
        confirmer !== reviewer ||
        machineApproved !== approvalReader ||
        stillApproved !== approved
      )
        throw modelReleaseError()
      const result = send(typeof released === 'string' ? reviewed : released)
      if (turn && reviewer) {
        // Commit only after the dispatch callback accepts (including its abort check).
        for (const key of reviewedIdentities) confirmed.add(key)
        turn.reviews.set(destination, { revision, approved, tokens: confirmed })
      }
      return result
    }
  }).then((dispatch) => dispatch())
}

/** Structured context/tool results are scanned including keys; the original is never returned. */
export async function releaseModelBoundValue<T>(value: T, projectId: string): Promise<T> {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) throw modelReleaseError()
  const released = await guardProviderBody(serialized, projectId)
  if (typeof released !== 'string') throw modelReleaseError()
  return JSON.parse(released) as T
}

export async function checkConnectorQueryArgs(args: Record<string, unknown>): Promise<void> {
  refuseConnectorQueryArgs(args)
  // A model-release preview must never approve a masked query while the connector sends its
  // original. Refuse changed queries rather than searching for a pseudonym or sending raw PHI.
  for (const [key, value] of Object.entries(args)) {
    if (CONNECTOR_QUERY_KEYS.has(key) && typeof value === 'string') {
      const spans = patientSpans(value)
      if (spans.length > 0 && isOrdinaryLabel(value) && hasOnlyOrdinaryLabelPhi(value, spans)) {
        // A reviewed ordinary label is a narrower subset of main's whole-query guess.
        // Check gate health/deadline; all other queries still take strict release.
        await assertModelBoundTextReleased('', currentPhiProject())
        continue
      }
      const released = await assertModelBoundTextReleased(value, currentPhiProject())
      if (released !== value) {
        const translate = blockTranslator
        throw new PhiGateError(
          translate(
            'The search terms changed during the privacy check. The search was not sent. Remove patient information and try again.'
          )
        )
      }
    }
  }
  await assertModelBoundTextReleased('', currentPhiProject())
}

export async function checkConnectorQueryUrl(url: string): Promise<void> {
  refuseConnectorQueryUrl(url)
  const args = Object.fromEntries(new URL(url).searchParams)
  await checkConnectorQueryArgs(args)
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
// Mentor discussion packs do not redact-and-send. Labeled patient spans block the
// outbound message before releaseModelText runs. A whole-string name guess is the
// same short-text heuristic the connector search ignores; it is not individual
// patient data, and the global gate still reviews whatever remains.
export function refuseMentorPackIndividualPatientData(texts: readonly string[]): void {
  const spans = texts.flatMap((text) =>
    patientSpans(text).filter((span) => !isWholeQueryNameGuess(text, span))
  )
  if (spans.length === 0) return
  const translate = blockTranslator
  throw new PhiGateError(
    translate(
      'This mentor discussion pack does not send individual patient data. The message was not sent.'
    ),
    spans
  )
}

export function refusePatientQuery(text: string): void {
  const detected = patientSpans(text)
  if (isOrdinaryLabel(text) && hasOnlyOrdinaryLabelPhi(text, detected)) return
  const spans = detected.filter((span) => !isWholeQueryNameGuess(text, span))
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

const OPAQUE_CONTENT_TYPES = new Set([
  'image',
  'image_url',
  'input_image',
  'input_file',
  'file',
  'document',
  'audio',
  'input_audio',
  'video'
])

/** Opaque bytes, remote media and file references cannot be checked as text. */
export function assertScannableModelValue(value: unknown): void {
  if (typeof value === 'string' && /^data:/iu.test(value))
    throw modelReleaseError(UNSCANNABLE_MODEL_CONTENT_MESSAGE)
  if (Array.isArray(value)) {
    for (const child of value) assertScannableModelValue(child)
  } else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.type === 'string' && OPAQUE_CONTENT_TYPES.has(record.type))
      throw modelReleaseError(UNSCANNABLE_MODEL_CONTENT_MESSAGE)
    for (const [key, child] of Object.entries(record)) {
      if (
        ['image_url', 'file_data', 'file_id', 'input_audio'].includes(key) &&
        (typeof child === 'string' ||
          (child &&
            typeof child === 'object' &&
            (typeof (child as Record<string, unknown>).url === 'string' ||
              typeof (child as Record<string, unknown>).data === 'string')))
      )
        throw modelReleaseError(UNSCANNABLE_MODEL_CONTENT_MESSAGE)
      assertScannableModelValue(child)
    }
  }
}

async function walkRelease(
  value: unknown,
  projectId: string,
  tokens: PhiReplacement[]
): Promise<unknown> {
  if (typeof value === 'string') {
    const result = await releaseThroughInstalledGate(value, projectId)
    if (result.warnings.length > 0) warnings.set(projectId, result.warnings)
    tokens.push(...result.replacements)
    return result.text
  }
  if (Array.isArray(value))
    return Promise.all(value.map((item) => walkRelease(item, projectId, tokens)))
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      const releasedKey = (await walkRelease(key, projectId, tokens)) as string
      if (Object.hasOwn(next, releasedKey)) throw modelReleaseError()
      Object.defineProperty(next, releasedKey, {
        value: await walkRelease(child, projectId, tokens),
        enumerable: true,
        configurable: true,
        writable: true
      })
    }
    return next
  }
  return value
}
