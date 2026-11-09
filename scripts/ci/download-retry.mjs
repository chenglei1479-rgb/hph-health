/* eslint-disable @typescript-eslint/explicit-function-return-type */

// Bounded retry for CI download steps, with a stable id, three failure kinds and a run-page
// annotation. Two callers share it: scripts/stage-schema-notebook-python.mjs (the CPython
// standalone archive) and scripts/fetch-micromamba.mjs (the micromamba release asset).
//
// Deliberately NOT inside the retry loop: the checksum comparison. A second download that produces
// a different digest than the first means the pinned digest is wrong, and retrying would turn that
// into an intermittent failure instead of a loud one. So `digest` is a final kind here - see
// retryDecision below - and each caller verifies after the fetch returns.
//
// Everything the callers need to decide is a pure function, so the policy can be asserted without
// a network, a clock or a process exit.

export const DOWNLOAD_MAX_ATTEMPTS = 3
export const DOWNLOAD_BASE_DELAY_MS = 2_000
export const DOWNLOAD_MAX_DELAY_MS = 15_000

/** The three ways a download step can fail, in the order the step reaches them. */
export const DOWNLOAD_FAILURE_KINDS = ['download', 'digest', 'extract']

export class DownloadFailure extends Error {
  constructor(kind, message, { attempts = 1, url } = {}) {
    if (!DOWNLOAD_FAILURE_KINDS.includes(kind)) {
      throw new Error(`unknown download failure kind: ${kind}`)
    }
    super(message)
    this.name = 'DownloadFailure'
    this.kind = kind
    this.attempts = attempts
    this.url = url
  }
}

/** Delay before attempt `attempt + 1`: exponential from the base, capped so one step cannot stall CI. */
export function retryDelayMs(
  attempt,
  { baseDelayMs = DOWNLOAD_BASE_DELAY_MS, maxDelayMs = DOWNLOAD_MAX_DELAY_MS } = {}
) {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new Error(`retry attempt must be a positive integer, got ${attempt}`)
  }
  return Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs)
}

/**
 * Pure retry policy. Only transport failures retry: a digest mismatch means the pin is wrong and an
 * extract failure means the bytes are not the archive we expected, so both are final on attempt 1.
 */
export function retryDecision({
  kind = 'download',
  attempt,
  maxAttempts = DOWNLOAD_MAX_ATTEMPTS,
  baseDelayMs = DOWNLOAD_BASE_DELAY_MS,
  maxDelayMs = DOWNLOAD_MAX_DELAY_MS
} = {}) {
  if (!DOWNLOAD_FAILURE_KINDS.includes(kind)) {
    throw new Error(`unknown download failure kind: ${kind}`)
  }
  if (kind !== 'download') return { retry: false, delayMs: 0, reason: `${kind}-is-final` }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error(`maxAttempts must be a positive integer, got ${maxAttempts}`)
  }
  if (attempt >= maxAttempts) return { retry: false, delayMs: 0, reason: 'attempts-exhausted' }
  return {
    retry: true,
    delayMs: retryDelayMs(attempt, { baseDelayMs, maxDelayMs }),
    reason: 'transport-retry'
  }
}

/** Stable id line, printed on every retry - including the retry that then succeeds. */
export function retryLogLine({ code, attempt, maxAttempts = DOWNLOAD_MAX_ATTEMPTS, url }) {
  return `${code} attempt=${attempt}/${maxAttempts}${url ? ` url=${url}` : ''}`
}

/** One line that names the class and the total number of attempts, e.g. `download attempts=3`. */
export function failureSummary({ kind = 'download', attempts = 1 }) {
  return `${kind} attempts=${attempts}`
}

/** GitHub Actions annotation, so the class is visible on the run page without opening the log. */
export function ciAnnotationLine({ title, kind = 'download', attempts = 1, url } = {}) {
  if (!title) throw new Error('annotation title is required')
  return `::error title=${title}::${failureSummary({ kind, attempts })}${url ? ` url=${url}` : ''}`
}

const defaultSleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms))

/**
 * Fetches `url` and returns the bytes, retrying transport failures up to `maxAttempts`.
 *
 * Emits `retryLogLine` before each retry so a run that recovers is still visible, and throws a
 * `DownloadFailure` carrying `attempts` when the budget is spent.
 */
export async function fetchBytesWithRetry({
  url,
  id,
  maxAttempts = DOWNLOAD_MAX_ATTEMPTS,
  baseDelayMs = DOWNLOAD_BASE_DELAY_MS,
  maxDelayMs = DOWNLOAD_MAX_DELAY_MS,
  fetchImpl = globalThis.fetch,
  sleep = defaultSleep,
  log = (line) => console.error(line)
} = {}) {
  if (!url) throw new Error('url is required')
  if (!id) throw new Error('id is required')
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetchImpl(url)
      if (!response?.ok) {
        throw new DownloadFailure('download', `HTTP ${response?.status ?? 'unknown'} for ${url}`, {
          attempts: attempt,
          url
        })
      }
      return Buffer.from(await response.arrayBuffer())
    } catch (error) {
      const failure =
        error instanceof DownloadFailure
          ? error
          : new DownloadFailure(
              'download',
              error instanceof Error ? error.message : String(error),
              {
                attempts: attempt,
                url
              }
            )
      const decision = retryDecision({
        kind: failure.kind,
        attempt,
        maxAttempts,
        baseDelayMs,
        maxDelayMs
      })
      if (!decision.retry) {
        throw new DownloadFailure(
          failure.kind,
          `${failureSummary({ kind: failure.kind, attempts: attempt })}: ${failure.message}`,
          { attempts: attempt, url }
        )
      }
      log(retryLogLine({ code: `${id}-RETRY-01`, attempt: attempt + 1, maxAttempts, url }))
      await sleep(decision.delayMs)
    }
  }
}

/** Runs a post-download stage (extract, copy) and classifies any failure that escapes it. */
export async function withDownloadStage(kind, run) {
  try {
    return await run()
  } catch (error) {
    if (error instanceof DownloadFailure) throw error
    throw new DownloadFailure(kind, error instanceof Error ? error.message : String(error))
  }
}

/** Logs the annotation for a classified failure and returns the line, for callers that want both. */
export function reportDownloadFailure(
  failure,
  // Workflow commands are read from stdout, so the annotation does not share the stderr channel
  // the callers use for their own diagnostics.
  { title, log = (line) => console.log(line) } = {}
) {
  if (!(failure instanceof DownloadFailure)) return undefined
  const line = ciAnnotationLine({
    title: title || 'download failed',
    kind: failure.kind,
    attempts: failure.attempts,
    url: failure.url
  })
  log(line)
  return line
}
