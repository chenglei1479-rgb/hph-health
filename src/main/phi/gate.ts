import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'
import { createLogger } from '@aipoch/diagnostics/node'
import { englishNativeTranslator, type NativeTranslator } from '../locale/main-process-messages'
import {
  PHI_BLOCK_CODE,
  PHI_CONSENT_CODE,
  PHI_INTERNAL_CODE,
  PHI_REVIEW_EXCLUDED_CODE,
  PHI_REVIEW_UNAVAILABLE_CODE,
  PHI_TURN_REPLACED_CODE,
  PHI_UNAVAILABLE_CODE,
  PHI_UNSCANNABLE_CODE,
  PHI_CLIENT_REFUSAL_CODES,
  phiFailureCodeOf,
  PhiPolicyError,
  type PhiFailureCode
} from '../../shared/phi-block'
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
import {
  deidentify,
  type DeidentifyOptions,
  type PhiReplacement,
  type PhiResult
} from './deidentify'
import { detectPhi, isAggregateAgeRule, type PhiCategory, type PhiSpan } from './detect'
import type { PhiStore } from './store'
import { hasOnlyOrdinaryLabelPhi, isOrdinaryLabel } from './ordinary-label'

export interface PhiBlockedSpan {
  start: number
  end: number
  category: PhiCategory
  text: string
  /** Stable id of the rule that produced the span, when that rule carries one. */
  rule?: string
}

// The class a human may see. `code` is the refusal class from ../../shared/phi-block; it decides the
// transport status and the retry advice, never the copy. A subclass of PhiPolicyError so the two
// layers above (assertModelBoundRelease, failClosed) preserve it instead of re-minting a generic one.
export class PhiGateError extends PhiPolicyError {
  readonly spans: readonly PhiBlockedSpan[]

  constructor(
    message: string,
    spans: readonly PhiBlockedSpan[] = [],
    code: PhiFailureCode = PHI_INTERNAL_CODE
  ) {
    super(message, code)
    this.name = 'PhiGateError'
    this.spans = spans
  }
}

const phiBlockLog = createLogger('phi')

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
  release(
    text: string,
    projectId: string,
    options?: DeidentifyOptions
  ): PhiResult | Promise<PhiResult>
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
// A consent-shaped stop keeps its own wording: the content was checked, and the review itself is what
// ended. Reusing the "could not finish" sentence here would invite a retry that only reopens the window.
export const PHI_REVIEW_EXPIRED_MESSAGE =
  'The privacy review was not confirmed in time. Nothing was sent.'
export const PHI_REVIEW_INVALIDATED_MESSAGE =
  'The privacy review is no longer valid. Nothing was sent.'
export const PHI_TURN_REPLACED_MESSAGE = 'This turn was replaced by a newer turn. Nothing was sent.'
export const PHI_INTERNAL_MESSAGE =
  'The request could not be prepared for sending. Nothing was sent.'
export const PHI_REVIEW_UNAVAILABLE_MESSAGE =
  'The privacy review is unavailable in this installation. Nothing was sent.'
export const UNSCANNABLE_MODEL_CONTENT_MESSAGE =
  'This attachment cannot be checked for patient information. Nothing was sent. Use checked text instead.'
export const UNGUARDED_AGENT_MESSAGE =
  'This agent connection cannot check every model request for patient information and is unavailable in beta. Choose a provider with a checked connection.'

// Each key is also a refusal class: cancelled is consent-shaped, "cannot be checked" can never succeed,
// and everything else means the engine could not finish (retryable). Callers that only need a message
// keep using this entry point, so classification does not depend on them remembering a code.
export function modelReleaseError(key = MODEL_RELEASE_RETRY_MESSAGE): PhiGateError {
  const translate = blockTranslator
  if (key === PHI_SEND_CANCELLED_MESSAGE)
    return new PhiGateError(translate('Sending cancelled. Nothing was sent.'), [], PHI_CONSENT_CODE)
  if (key === UNSCANNABLE_MODEL_CONTENT_MESSAGE)
    return new PhiGateError(
      translate(
        'This attachment cannot be checked for patient information. Nothing was sent. Use checked text instead.'
      ),
      [],
      PHI_UNSCANNABLE_CODE
    )
  if (key === UNGUARDED_AGENT_MESSAGE)
    return new PhiGateError(
      translate(
        'This agent connection cannot check every model request for patient information and is unavailable in beta. Choose a provider with a checked connection.'
      ),
      [],
      PHI_UNSCANNABLE_CODE
    )
  return new PhiGateError(
    translate('The privacy check could not finish. Nothing was sent. Please try again.'),
    [],
    PHI_UNAVAILABLE_CODE
  )
}

// A consent step ended: the review window timed out, its state was invalidated before the send, or the
// bridge has no review surface at all. None of these is a content refusal, and none should be retried
// automatically - a retry reopens the window the user already left.
export function phiConsentError(message: string = PHI_REVIEW_EXPIRED_MESSAGE): PhiGateError {
  return new PhiGateError(blockTranslator(message), [], PHI_CONSENT_CODE)
}

export function phiTurnReplacedError(): PhiGateError {
  return new PhiGateError(blockTranslator(PHI_TURN_REPLACED_MESSAGE), [], PHI_TURN_REPLACED_CODE)
}

// The bridge exists but cannot ask a human. Classified as E (409), not C1: installPhiConfirmer only
// runs during composition, so this process cannot recover - 503 would claim "later will be better" and
// be lying. The wiring gap is still made audible in the log (`reason=bridge-has-no-review-surface`).
export function phiReviewUnavailableError(): PhiGateError {
  return new PhiGateError(
    blockTranslator(PHI_REVIEW_UNAVAILABLE_MESSAGE),
    [],
    PHI_REVIEW_UNAVAILABLE_CODE
  )
}

// An invariant inside the gate broke (a release whose shape we do not understand, a de-identification
// collision). Retrying proves nothing, and the copy must not describe the internals to a person.
export function phiInternalError(): PhiGateError {
  return new PhiGateError(blockTranslator(PHI_INTERNAL_MESSAGE), [], PHI_INTERNAL_CODE)
}

// One place that decides what a caught release failure means. Typed gate errors keep their class; a
// typed policy error from the store is an internal invariant, and an untyped error is the engine being
// unavailable. The original message is never reused: it can carry a local vault path.
function escalateReleaseFailure(error: unknown): never {
  if (error instanceof PhiGateError) throw error
  if (error instanceof PhiPolicyError) {
    // A typed error from the store keeps its class: an unavailable engine stays retryable, and only
    // an invariant failure becomes E. Nothing but the stable code is logged.
    if (error.code === PHI_UNAVAILABLE_CODE) {
      phiBlockLog.warn('phi release unavailable', { code: error.code, reason: 'gate-unavailable' })
      throw modelReleaseError()
    }
    phiBlockLog.warn('phi release refused by an internal invariant', { code: error.code })
    throw phiInternalError()
  }
  // #243: a refusal that lost its prototype crossing a bundle boundary. In the packaged app the gate
  // is produced in the backend bundle and consumed elsewhere, so `instanceof` can be false for a real
  // refusal; without this branch it became the generic retryable sentence (and a 502 at the bridge)
  // instead of the 400 + stable code the client must see. The code is the identity.
  const foreignCode = phiFailureCodeOf(error)
  if (foreignCode && PHI_CLIENT_REFUSAL_CODES.includes(foreignCode)) {
    phiBlockLog.warn('phi release refused by a foreign copy of the gate class', {
      code: foreignCode
    })
    throw new PhiGateError(error instanceof Error ? error.message : '', [], foreignCode)
  }
  phiBlockLog.warn('phi release unavailable', { code: PHI_UNAVAILABLE_CODE, reason: 'gate-error' })
  throw modelReleaseError()
}

function activeGate(): PhiGate {
  if (!gate) throw modelReleaseError()
  return gate
}

async function releaseThroughInstalledGate(
  text: string,
  projectId: string,
  options?: DeidentifyOptions
): Promise<PhiResult> {
  try {
    const result = await activeGate().release(text, projectId, options)
    if (
      !result ||
      typeof result.text !== 'string' ||
      !Array.isArray(result.replacements) ||
      !Array.isArray(result.warnings)
    ) {
      throw phiInternalError()
    }
    return result
  } catch (error) {
    // Vault/scanner errors can contain local paths, so the message is dropped here and only the class
    // survives. This runs once per released string, so it stays allocation-free apart from the log.
    escalateReleaseFailure(error)
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
    escalateReleaseFailure(error)
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
    release: (text, projectId, options) => deidentify(text, open(projectId), options),
    restore: (text, projectId) => open(projectId).restore(text),
    highlights: (text, projectId) => open(projectId).highlights(text),
    manual: (original, projectId) => open(projectId).manual(original)
  }
}

export function createClosedGate(message: string): PhiGate {
  return {
    // Diagnostic text, not user copy: the caller passes an internal reason (a vault that cannot be
    // decrypted), so it must not be shown verbatim. escalateReleaseFailure turns it into the standard
    // retry sentence and logs only the stable code.
    release() {
      throw new PhiPolicyError(message, PHI_UNAVAILABLE_CODE)
    },
    restore() {
      throw new PhiPolicyError(message, PHI_UNAVAILABLE_CODE)
    },
    manual() {
      throw new PhiPolicyError(message, PHI_UNAVAILABLE_CODE)
    }
  }
}

function failClosed(error: unknown): never {
  escalateReleaseFailure(error)
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
  const detected = detectPhi(text).filter(
    (span) =>
      PATIENT_PHI.has(span.category) &&
      // #170: a mean age or a "per N years" rate denominator is a group statistic, not a person's age.
      // Only those two rule ids qualify; every other age keeps blocking.
      !isAggregateAgeRule(span.rule)
  )
  return detected
    .filter((span) => !detected.some((other) => contained(span, other)))
    .map((span) => ({
      start: span.start,
      end: span.end,
      category: span.category,
      text: span.text,
      rule: span.rule
    }))
}

// A scanned string plus where it sits in the provider body (`input[2].content[0].text`, `system`).
// The path describes structure only: object keys in a provider body come from provider schemas, and a
// caller must never feed user-derived keys here (the blocking projection walks known content keys).
type ScannedModelText = { text: string; field: string }

/** One blocked hit, as written to the log: never the matched text. */
export type BlockedSpanDiagnostic = {
  category: string
  offset: number
  length: number
  field: string
  /** Which scan produced the hit. The pre-release scan and the restore-before-send scan see
   * different strings, so an offset is only meaningful next to the pass that produced it. */
  pass: 'blocked' | 'restored'
  /** Length of the scanned string in UTF-16 code units, the same base as `offset`. */
  textLength: number
  /** First 8 hex characters of SHA-256(text): a hash, never the first characters of the text. It
   * lets a candidate copy be matched to the scanned string without logging any content. */
  textDigest8: string
  /** Stable id of the rule that fired, e.g. `insurer-no-bare-8`. */
  rule?: string
}

const textDigest8 = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 8)

// Object keys are printed into the block log as part of the field path, so only ASCII-shaped keys
// count as structure. `messages[i].content[j].input` holds model-generated JSON, and its key names can
// be copied from the conversation ("<a name>" -> value); a CJK or otherwise odd key becomes `[key]`
// and never reaches the log.
const SAFE_FIELD_KEY = /^[A-Za-z_][A-Za-z0-9_-]{0,40}$/u

const normalizeScanned = (values: readonly (string | ScannedModelText)[]): ScannedModelText[] =>
  values.map((value) => (typeof value === 'string' ? { text: value, field: 'body' } : value))

// #244: tool call arguments and tool outputs are machine-generated fields. A bare ISO date there is
// the agent's own bookkeeping — a filename, a query window — not a patient date, and one hit refused
// the whole turn (session #28; the same family as #131). Only that one rule is exempt, and only in
// those fields: the same shape in text the researcher typed still blocks, so the DATE category
// itself is not weakened.
const MACHINE_TOOL_FIELD = /^input\[\d+\]\.(?:arguments|output)(?:\.|\[|$)/u
const MACHINE_TOOL_EXEMPT_RULES = new Set(['date-bare-iso'])

const diagnosticFor = (
  values: readonly ScannedModelText[],
  pass: 'blocked' | 'restored'
): { diagnostics: BlockedSpanDiagnostic[]; spans: PhiBlockedSpan[] } => {
  const diagnostics: BlockedSpanDiagnostic[] = []
  const spans: PhiBlockedSpan[] = []
  for (const { text, field } of values) {
    const found = patientSpans(text).filter(
      (span) => !(MACHINE_TOOL_FIELD.test(field) && MACHINE_TOOL_EXEMPT_RULES.has(span.rule ?? ''))
    )
    // Hash only when something was blocked: the gate runs on every outbound request, and a digest per
    // scanned string would be paid by every send that never blocks.
    const digest = found.length === 0 ? '' : textDigest8(text)
    for (const span of found) {
      spans.push(span)
      diagnostics.push({
        category: span.category,
        offset: span.start,
        length: span.end - span.start,
        field,
        pass,
        textLength: text.length,
        textDigest8: digest,
        rule: span.rule
      })
    }
  }
  return { diagnostics, spans }
}

/**
 * The diagnostic payload for a provider body: category, offset, length and the structural field for
 * every hit, and no matched text. Reading the field is what tells a `system` prompt hit apart from a
 * conversation hit when a false positive has to be localized.
 */
export const blockedSpanDiagnostics = (body: unknown): BlockedSpanDiagnostic[] =>
  diagnosticFor(collectModelContentStrings(body), 'blocked').diagnostics

// The restore-before-send pass scans strings that differ from the released body: vault marks are
// swapped back for the original values, so an offset from this pass does not apply to the body anyone
// can read. Both passes are reported with the same `field`, and `pass` is what tells them apart.
const restoredScannedTexts = (
  body: unknown,
  restore: (text: string) => string
): ScannedModelText[] =>
  collectModelContentStrings(body).map((value) => ({ ...value, text: restore(value.text) }))

export const restoredBlockedSpanDiagnostics = (
  body: unknown,
  restore: (text: string) => string
): BlockedSpanDiagnostic[] =>
  diagnosticFor(restoredScannedTexts(body, restore), 'restored').diagnostics

function assertMachineMaySend(
  texts: readonly (string | ScannedModelText)[],
  pass: 'blocked' | 'restored' = 'blocked'
): void {
  let approved = false
  try {
    approved = machineApproved()
  } catch {
    throw modelReleaseError()
  }
  if (approved) return
  const { diagnostics, spans } = diagnosticFor(normalizeScanned(texts), pass)
  if (spans.length === 0) return
  const translate = blockTranslator
  // The blocked span text is patient information. Keep it out of the log: the stable number plus where
  // and how long each hit was is enough to identify the false positive without persisting PHI to disk.
  phiBlockLog.warn('model content blocked', {
    code: PHI_BLOCK_CODE,
    hits: spans.length,
    spans: diagnostics
  })
  throw new PhiGateError(formatUnapprovedBlock(translate), spans, PHI_BLOCK_CODE)
}

// Provider bodies carry both content and application-generated scaffolding. Two different projections
// are needed, and conflating them caused a leak:
//
// - Blocking scans values only, and skips scaffolding subtrees. `tools` descriptions were read as
//   PERSON_NAME, the CLI system prompt date as DATE and request ids as INSURED_ID, which made every
//   Codex request fail with a hospital-approval block. `instructions` is skipped here on purpose: the
//   CLI writes the current date into it, so scanning it blocks every request.
//   Known gap: PHI placed in `instructions` cannot trigger an approval block.
// - Releasing still rewrites `instructions` (that gap is closed by de-identifying it) and skips only
//   the schema/transport scaffolding and identifiers.
//
// `client_metadata` is the Codex CLI's own transport envelope, not content: it is written by the CLI
// (nothing in this app writes it), and a real request captured from the managed CLI (codex-cli 0.157.1,
// the version beta.21 and main both pin) carried exactly installation/session/thread/turn/window ids,
// `agent_name`, the request/thread/sandbox enums, booleans, a timestamp, the model name and a
// `workspaces` object (folder path, remote URL, commit hash). Only the last part is environment text the
// user chose, which is why blocking skips the field but releasing still rewrites it: a false positive
// here does not merely look odd, it vetoes the whole turn (beta.21 #159: a `NN-NNNN-NN` fragment inside
// this field failed every retry of a public literature query with PHI-BLOCK-01 behind a 502), while a
// patient name inside a folder path is still masked before the body leaves the machine. It is therefore
// in BLOCKING_SKIP_FIELDS only, and must never be added to RELEASE_SKIP_FIELDS.
//
// `tools`, `tool_choice`, `metadata` and identifier keys pass through untouched in both directions.
// That boundary is deliberate: rewriting a tool schema breaks the provider protocol. It is also the
// one known exit for content: patient text written into those fields is neither blocked nor
// de-identified. Nothing in the app does that today — `metadata` carries only generated ids and tool
// descriptions are ours — but new code must not put user or project text there, and JSON keys
// elsewhere are still released.
//
// Everything else stays in scope, including `system`, `messages`, `input` and `prompt`: providers
// disagree about which field carries the conversation, and whitelisting content fields leaked PHI
// through Anthropic's `system`.
const BLOCKING_SKIP_FIELDS = new Set([
  'tools',
  'tool_choice',
  'instructions',
  'metadata',
  'client_metadata'
])
const RELEASE_SKIP_FIELDS = new Set(['tools', 'tool_choice', 'metadata'])
// #244: fields the agent runtime writes for its own bookkeeping (`x-codex-turn-metadata` and its
// siblings - the `x-codex-` prefix, not the whole `client_metadata` object). Blocking already skips
// them (#194); rewriting them replaced the CLI's own ids with insurance-number placeholders, so an
// unlabeled insured-id shape inside such a field is released unchanged. Names, dates and a labelled
// insurance number in a workspace path still go through the detector (#159).
const AGENT_RESERVED_KEY = /^x-codex-/u
const NON_CONTENT_KEYS = new Set([
  'id',
  'ids',
  'call_id',
  'tool_call_id',
  'item_id',
  'response_id',
  'previous_response_id',
  'prompt_cache_key',
  'type',
  'role',
  'status'
])

const isIdentifierKey = (key: string): boolean =>
  NON_CONTENT_KEYS.has(key) || /(?:^|_)(?:id|ids)$/iu.test(key)

const isBlockingKey = (key: string): boolean =>
  !BLOCKING_SKIP_FIELDS.has(key) && !isIdentifierKey(key)

const isReleaseKey = (key: string): boolean =>
  !RELEASE_SKIP_FIELDS.has(key) && !isIdentifierKey(key)

function collectContentValue(
  value: unknown,
  field: string,
  out: ScannedModelText[],
  include: (key: string) => boolean
): void {
  if (typeof value === 'string') {
    out.push({ text: value, field: field || 'body' })
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectContentValue(item, `${field}[${index}]`, out, include))
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (!include(key)) continue
      // Provider keys are ASCII (`system`, `messages`, `content`, `text`, `input`, `arguments`,
      // `properties`), which keeps the path readable. Anything else may be data-derived and collapses
      // to `[key]`, because a key copied from model output must not be written to the log.
      const label = SAFE_FIELD_KEY.test(key) ? key : '[key]'
      collectContentValue(child, field ? `${field}.${label}` : label, out, include)
    }
  }
}

function collectModelContentStrings(body: unknown): ScannedModelText[] {
  const out: ScannedModelText[] = []
  if (typeof body === 'string') {
    out.push({ text: body, field: 'body' })
    return out
  }
  collectContentValue(body, '', out, isBlockingKey)
  return out
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
    throw restoreFailure(error)
  }
}

// Restore failures never reach the client verbatim. The underlying message can name the local vault
// path - the first use of a project writes <userData>/phi/vault.bin, and a writeFileSync EACCES or
// ENOSPC message is `<code>: ..., open 'C:\Users\<name>\...\vault.bin'` - and this text is returned
// from a model-output path whose body is rendered as-is, so the message must not travel. The class is
// preserved (an unavailable vault stays a retryable 503, an internal invariant stays a 409), the body
// gets the stable sentence, and only the log sees the original message. Never swallowed: the caller
// still gets a typed failure and the output is still not shown.
function restoreFailure(error: unknown): PhiGateError {
  const code = error instanceof PhiPolicyError ? error.code : PHI_INTERNAL_CODE
  phiBlockLog.warn('phi restore failed', {
    code,
    message: error instanceof Error ? error.message : String(error)
  })
  return new PhiGateError(PHI_INTERNAL_MESSAGE, [], code)
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
    if (!Array.isArray(content)) throw phiInternalError()
    assertMachineMaySend(
      content.flatMap((block, index) => {
        const text = blockText(block)
        // Keep the block index: a hit inside a prompt array is otherwise reported as a bare `body`.
        return text == null ? [] : [{ text, field: `content[${index}]` }]
      })
    )
    if (content.length === 0) await releaseThroughInstalledGate('', projectId)
    const released: unknown[] = []
    for (const block of content) {
      const text = blockText(block)
      if (text == null || (block as PromptBlock).type !== 'text')
        throw modelReleaseError(UNSCANNABLE_MODEL_CONTENT_MESSAGE)
      const result = await releaseThroughInstalledGate(text, projectId)
      if (result.warnings.length > 0) warnings.set(projectId, result.warnings)
      released.push(result.text === text ? block : { ...block, text: result.text })
    }
    return released as T
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
  const timer = setTimeout(() => controller.abort(phiConsentError()), PHI_CONSENT_EXPIRY_MS)
  try {
    if (!confirmer) throw phiConsentError()
    const decision = await Promise.race([
      confirmer(preview, controller.signal),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(phiConsentError()), {
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
  collectors: ReviewCollectors = { tokens: [], review: { tokens: [], texts: [] } }
): Promise<BodyInit | null | undefined> {
  if (body == null) {
    await assertModelBoundTextReleased('', projectId)
    return body
  }
  if (typeof body !== 'string') {
    throw new PhiGateError(
      'PHI gate cannot scan this request body. The request was not sent.',
      [],
      PHI_UNSCANNABLE_CODE
    )
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
    const texts = collectModelContentStrings(parsed)
    assertMachineMaySend(texts)
    if (texts.length === 0) await releaseThroughInstalledGate('', projectId)
    const walked = await walkReleaseContent(parsed, projectId, collectors)
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
    if (!destination) throw phiInternalError()
    const turn = turns.getStore()
    const assertCurrentTurn = (): void => {
      if (turn && (!turn.active || !turn.isCurrent() || turns.getStore() !== turn))
        throw phiTurnReplacedError()
    }
    assertCurrentTurn()
    const revision = policyRevision
    const installed = activeGate()
    const reviewer = confirmer
    const approvalReader = machineApproved
    const approved = approvalReader()
    const collectors: ReviewCollectors = { tokens: [], review: { tokens: [], texts: [] } }
    const tokens = collectors.tokens
    const released = await guardProviderBodyImpl(body, projectId, collectors)
    const text = typeof released === 'string' ? released : ''
    // Vault provenance retains marks from earlier preparation and manual masking.
    // Restore only for the local approval check; the restored value is never sent.
    assertMachineMaySend(
      typeof released === 'string'
        ? restoredScannedTexts(JSON.parse(text), (value) => installed.restore(value, projectId))
        : [],
      'restored'
    )
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
    // Only user-facing content is reviewed. A vault mark is kept when the marked text also appears in a
    // reviewed content string, so a placeholder that exists only inside the application prompt cannot
    // drag a doctor into a review of our own instructions.
    const reviewTexts = collectors.review.texts.join('\n')
    const highlights = (installed.highlights?.(text, projectId) ?? []).filter((mark) =>
      reviewTexts.includes(text.slice(mark.start, mark.end))
    )
    // Custom scanners also contribute their replacements without needing a vault.
    const unique = new Map<string, PhiHighlight>()
    for (const mark of [...highlights, ...highlightTokens(text, collectors.review.tokens)]) {
      unique.set(JSON.stringify([mark.start, mark.end, mark.category]), mark)
    }
    // Replacements inside application-owned prompt text are released but never reviewed. The window does
    // not open for them at all, so without this line the case would leave no trace anywhere: record the
    // stable id, the count and the categories - never the replaced text (#160).
    const applicationTokens = collectors.tokens.filter(
      (token) => !collectors.review.tokens.includes(token)
    )
    if (applicationTokens.length > 0) {
      phiBlockLog.info('application prompt text released without review', {
        code: PHI_REVIEW_EXCLUDED_CODE,
        hits: applicationTokens.length,
        categories: [...new Set(applicationTokens.map((token) => token.category))]
      })
    }
    const preview = {
      text,
      // Replacements inside the application prompt are reported, never reviewed.
      applicationReplacements: applicationTokens.length,
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
    return async () => {
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
        throw phiConsentError(PHI_REVIEW_INVALIDATED_MESSAGE)
      const result = await send(typeof released === 'string' ? reviewed : released)
      if (turn && reviewer) {
        // Rejected sends must not grant consent to a later retry in this turn.
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
  if (serialized === undefined) throw phiInternalError()
  const released = await guardProviderBody(serialized, projectId)
  if (typeof released !== 'string') throw phiInternalError()
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
          ),
          [],
          PHI_BLOCK_CODE
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
    spans,
    PHI_BLOCK_CODE
  )
}

export function refusePatientQuery(text: string): void {
  const detected = patientSpans(text)
  if (isOrdinaryLabel(text) && hasOnlyOrdinaryLabelPhi(text, detected)) return
  const spans = detected.filter((span) => !isWholeQueryNameGuess(text, span))
  if (spans.length === 0) return
  throw new PhiGateError(CONNECTOR_PATIENT_QUERY_MESSAGE, spans, PHI_BLOCK_CODE)
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

// Two keys can de-identify to the same replacement — the same name used as two keys. Sending the body
// anyway would silently drop one of them, so the gate refuses instead: releasing must never change the
// shape of what it sends. Defining the property keeps a released `__proto__` key a plain key.
function defineReleasedKey(next: Record<string, unknown>, key: string, value: unknown): void {
  // Two distinct keys de-identified to the same replacement. This is a collision inside our own
  // pseudonymization, not patient information the doctor sent, so it must never be classified as A.
  if (Object.hasOwn(next, key)) throw phiInternalError()
  Object.defineProperty(next, key, { value, enumerable: true, configurable: true, writable: true })
}

// Releases every content field — including `instructions`, which is deliberately not part of the
// blocking scan — and copies schema/transport scaffolding through untouched. Object keys are released
// as well: arbitrary JSON carried in a body can put data in a key, and the de-identify pass must not
// leave patient text there either.
// `instructions` is the agent prompt the CLI composes (our base instructions, the registered Skill
// catalog, project AGENTS.md). It is released like every other text — the scan does not skip it — but its
// replacements belong to application-owned prompt text, not to the request a doctor wrote, so they are
// never put in front of a human for review (#160). Everything outside it stays reviewable.
const APPLICATION_TEXT_KEYS = new Set(['instructions'])

type ReviewCollectors = {
  /** Every replacement, application text included: the release bookkeeping. */
  tokens: PhiReplacement[]
  /** Replacements inside user-facing content, plus the released strings they came from. */
  review: { tokens: PhiReplacement[]; texts: string[] }
}

async function walkReleaseContent(
  body: unknown,
  projectId: string,
  collectors: ReviewCollectors
): Promise<unknown> {
  if (typeof body === 'string' || Array.isArray(body)) {
    return releaseContentValue(body, projectId, collectors)
  }
  if (!body || typeof body !== 'object') return body
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    const agentReserved = AGENT_RESERVED_KEY.test(key)
    if (!isReleaseKey(key)) {
      next[key] = value
      continue
    }
    const scope = APPLICATION_TEXT_KEYS.has(key)
      ? { ...collectors, review: { tokens: [], texts: [] } }
      : collectors
    const releasedKey = await releaseContentValue(key, projectId, collectors, agentReserved)
    defineReleasedKey(
      next,
      typeof releasedKey === 'string' ? releasedKey : key,
      await releaseContentValue(value, projectId, scope, agentReserved)
    )
  }
  return next
}

async function releaseContentValue(
  value: unknown,
  projectId: string,
  collectors: ReviewCollectors,
  agentReserved = false
): Promise<unknown> {
  if (typeof value === 'string') {
    const result = await releaseThroughInstalledGate(
      value,
      projectId,
      agentReserved ? { keepUnlabeledInsuredIds: true } : undefined
    )
    if (result.warnings.length > 0) warnings.set(projectId, result.warnings)
    // One pass over the replacements: callers instrument them with an iterator, and the two collectors
    // must observe the same list rather than a second traversal.
    const replacements = [...result.replacements]
    collectors.tokens.push(...replacements)
    collectors.review.tokens.push(...replacements)
    collectors.review.texts.push(result.text)
    return result.text
  }
  if (Array.isArray(value)) {
    const released: unknown[] = []
    for (const item of value)
      released.push(await releaseContentValue(item, projectId, collectors, agentReserved))
    return released
  }
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      if (!isReleaseKey(key)) {
        next[key] = child
        continue
      }
      const childReserved = agentReserved || AGENT_RESERVED_KEY.test(key)
      const releasedKey = await releaseContentValue(key, projectId, collectors, childReserved)
      defineReleasedKey(
        next,
        typeof releasedKey === 'string' ? releasedKey : key,
        await releaseContentValue(child, projectId, collectors, childReserved)
      )
    }
    return next
  }
  return value
}
