import { randomBytes, randomUUID } from 'node:crypto'
import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'node:http'

import { createLogger, errorLogFields, type Logger } from '@aipoch/diagnostics/node'

import {
  PHI_CLIENT_REFUSAL_CODES,
  PHI_INTERNAL_CODE,
  PHI_UNAVAILABLE_CODE,
  PHI_UNRETRYABLE_INTERNAL_CODES,
  PhiPolicyError,
  type PhiFailureCode
} from '../../shared/phi-block'

// A turn may contain up to 24 MiB of base64 image data before frameworks add text, replayed history,
// and tool declarations. Keep every authenticated Provider bridge on one memory-bounded envelope.
const MAX_PROVIDER_LOOPBACK_REQUEST_BYTES = 64 * 1024 * 1024

type ProviderLoopbackConnection = Readonly<{
  baseUrl: string
  token: string
}>

type ProviderLoopbackJsonObject = Record<string, unknown>

type ProviderLoopbackHttpRequest = Readonly<{
  method: string | undefined
  path: string
  url: URL
  headers: IncomingHttpHeaders
  signal: AbortSignal
  readJsonObject: () => Promise<ProviderLoopbackJsonObject>
}>

type ProviderLoopbackHttpHostOptions<Connection extends ProviderLoopbackConnection> = Readonly<{
  diagnosticName: string
  diagnostics?: Pick<Logger, 'info' | 'error'>
  credentialMode: 'bearer' | 'bearer-or-api-key'
  createConnection: (origin: string, token: string) => Connection
  handle: (request: ProviderLoopbackHttpRequest, response: ServerResponse) => Promise<void>
  onUnauthorized: (response: ServerResponse) => void
  onError: (error: unknown, response: ServerResponse) => void
}>

const defaultDiagnostics = createLogger('provider-loopback')

class ProviderLoopbackRequestError extends Error {
  constructor(message: string, options: ErrorOptions = {}) {
    super(message, options)
    this.name = 'ProviderLoopbackRequestError'
  }
}

// #195: one place decides what a refusal means for the transport, and every bridge reads that answer.
// The question is "would resending the same request produce a different answer?", never "what should the
// doctor read".
//
//   code                        class  status  retry?  why
//   PHI-BLOCK-01                A      400     no      patient information was found
//   PHI-UNSCANNABLE-01          B      400     no      this request can never be checked as text
//   PHI-CONSENT-01              D      400     no      a human review step ended or was refused
//   PHI-TURN-REPLACED-01        D      400     no      the turn this request belonged to is stale
//   PHI-UNAVAILABLE-01          C1     503     yes     the policy engine could not finish
//   PHI-INTERNAL-01             E      409     no      an invariant inside the gate broke
//   PHI-REVIEW-UNAVAILABLE-01   E      409     no      no review surface is wired up in this runtime
//   (anything else)             ?      500     no      unmapped: reported with its own code, never 400
//
// Why not 4xx for everything: a 4xx tells the client "never retry", and an unclassified failure may be
// temporary - that would make a recoverable failure permanent. Why 503 only for C1 and never for an
// unknown or internal failure: 503 asserts "later will be better", a judgement we do not have there (and
// for E it would be false - a broken invariant or an unwired review surface cannot fix itself mid-process,
// while retrying after a review can reopen the consent window). Unknown codes stay 500 and name
// themselves. Retries cost time and log lines, never confidentiality: fail-closed already guarantees the
// request is not sent.
export type PhiErrorStatus = { status: number; code?: string }

const classify = (code: string): PhiErrorStatus => {
  // The lists live next to the codes, so this function cannot drift into a second statement of which
  // refusals are client errors. An unmapped code must name itself: that string is the only signal that
  // can grow the table.
  if (PHI_CLIENT_REFUSAL_CODES.includes(code as PhiFailureCode)) return { status: 400, code }
  if (PHI_UNRETRYABLE_INTERNAL_CODES.includes(code as PhiFailureCode)) return { status: 409, code }
  if (code === PHI_UNAVAILABLE_CODE) return { status: 503, code }
  defaultDiagnostics.warn('unmapped phi failure code', { code })
  return { status: 500, code }
}

export function statusForPhiError(error: unknown): PhiErrorStatus {
  // PhiGateError extends PhiPolicyError and carries the same code, so one branch covers both.
  if (error instanceof PhiPolicyError) return classify(error.code ?? PHI_INTERNAL_CODE)
  if (error instanceof ProviderLoopbackRequestError) return { status: 400 }
  return { status: 502 }
}

// The body every bridge sends. `code` is carried for unknown classes too (500 included): it is a stable
// id, never patient text or a local path, and it is the only signal that can grow the mapping table.
export const phiErrorResponse = (
  error: unknown,
  fallbackMessage: string
): { status: number; body: { error: { type: string; message: string; code?: string } } } => {
  const { status, code } = statusForPhiError(error)
  return {
    status,
    body: {
      error: {
        type: status === 400 ? 'invalid_request_error' : 'api_error',
        message: error instanceof Error ? error.message : fallbackMessage,
        ...(code ? { code } : {})
      }
    }
  }
}

// Kept for callers that only ask the boolean question; the answer now comes from the same classifier.
const providerLoopbackClientError = (error: unknown): boolean =>
  statusForPhiError(error).status === 400

const writeProviderLoopbackJson = (
  response: ServerResponse,
  status: number,
  body: unknown
): void => {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

const oversizedRequestError = (): ProviderLoopbackRequestError =>
  new ProviderLoopbackRequestError('Provider loopback request exceeds the 64 MiB size limit.')

const closeRequestAfterResponse = (request: IncomingMessage, response: ServerResponse): void => {
  response.shouldKeepAlive = false
  if (!response.headersSent) response.setHeader('connection', 'close')
  if (response.writableFinished) request.destroy()
  else response.once('finish', () => request.destroy())
}

const readJsonObject = async (
  request: IncomingMessage,
  response: ServerResponse
): Promise<ProviderLoopbackJsonObject> => {
  const declaredLength = request.headers['content-length']
  if (
    declaredLength !== undefined &&
    Number(declaredLength) > MAX_PROVIDER_LOOPBACK_REQUEST_BYTES
  ) {
    closeRequestAfterResponse(request, response)
    throw oversizedRequestError()
  }

  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.length
    if (size > MAX_PROVIDER_LOOPBACK_REQUEST_BYTES) {
      request.destroy()
      throw oversizedRequestError()
    }
    chunks.push(bytes)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch (error) {
    throw new ProviderLoopbackRequestError('Provider loopback request must contain valid JSON.', {
      cause: error
    })
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ProviderLoopbackRequestError('Provider loopback request body must be a JSON object.')
  }
  return parsed as ProviderLoopbackJsonObject
}

const closeServer = async (server: Server): Promise<void> => {
  if (!server.listening) return
  const closing = new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  )
  server.closeAllConnections()
  await closing
}

class ProviderLoopbackHttpHost<Connection extends ProviderLoopbackConnection> {
  private server: Server | undefined
  private connection: Connection | undefined
  private startPromise: Promise<Connection> | undefined
  private closePromise: Promise<void> | undefined
  private closingStartPromise: Promise<Connection> | undefined
  private lifecycle: { expectedClose: boolean } | undefined

  constructor(private readonly options: ProviderLoopbackHttpHostOptions<Connection>) {}

  start(): Promise<Connection> {
    if (!this.closePromise && this.connection) return Promise.resolve(this.connection)
    if (this.startPromise && this.startPromise !== this.closingStartPromise) {
      return this.startPromise
    }

    const closing = this.closePromise
    const starting = (async (): Promise<Connection> => {
      if (closing) await closing
      if (this.connection) return this.connection
      return this.startServer()
    })()
    this.startPromise = starting
    void starting.then(
      () => {
        if (this.startPromise === starting) this.startPromise = undefined
      },
      () => {
        if (this.startPromise === starting) this.startPromise = undefined
      }
    )
    return starting
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise
    const starting = this.startPromise
    this.closingStartPromise = starting
    const closing = this.closeAfterStart(starting)
    this.closePromise = closing
    void closing.then(
      () => this.finishClose(closing, starting),
      () => this.finishClose(closing, starting)
    )
    return closing
  }

  private async startServer(): Promise<Connection> {
    const token = randomBytes(24).toString('hex')
    const diagnostics = this.options.diagnostics ?? defaultDiagnostics
    const bridgeId = randomUUID()
    const startedAt = Date.now()
    const lifecycle = { expectedClose: false }
    let port: number | undefined
    const diagnosticFields = (): Record<string, unknown> => ({
      bridge: this.options.diagnosticName,
      bridgeId,
      ...(port === undefined ? {} : { port })
    })
    const server = createServer((request, response) => {
      void this.serve(request, response, token).catch((error: unknown) => {
        if (response.destroyed || response.writableEnded) return
        try {
          this.options.onError(error, response)
        } catch {
          response.destroy()
        }
      })
    })
    server.on('error', (error) =>
      diagnostics.error('provider loopback server error', {
        ...diagnosticFields(),
        ...errorLogFields(error)
      })
    )
    server.once('close', () =>
      diagnostics.info('provider loopback closed', {
        ...diagnosticFields(),
        expected: lifecycle.expectedClose,
        lifetimeMs: Date.now() - startedAt
      })
    )
    this.server = server
    this.lifecycle = lifecycle
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error): void => reject(error)
        server.once('error', onError)
        server.listen(0, '127.0.0.1', () => {
          server.off('error', onError)
          resolve()
        })
      })
      server.unref()
      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('Provider loopback HTTP host did not bind a port.')
      }
      port = address.port
      diagnostics.info('provider loopback listening', diagnosticFields())
      const connection = this.options.createConnection(`http://127.0.0.1:${address.port}`, token)
      this.connection = connection
      return connection
    } catch (error) {
      lifecycle.expectedClose = true
      diagnostics.error('provider loopback failed to start', {
        ...diagnosticFields(),
        ...errorLogFields(error)
      })
      if (this.server === server) this.server = undefined
      this.connection = undefined
      await closeServer(server).catch(() => undefined)
      if (this.lifecycle === lifecycle) this.lifecycle = undefined
      throw error
    }
  }

  private async closeAfterStart(starting: Promise<Connection> | undefined): Promise<void> {
    await starting?.catch(() => undefined)
    const server = this.server
    const lifecycle = this.lifecycle
    this.server = undefined
    this.connection = undefined
    if (lifecycle) lifecycle.expectedClose = true
    if (server) await closeServer(server)
    if (this.lifecycle === lifecycle) this.lifecycle = undefined
  }

  private finishClose(closing: Promise<void>, starting: Promise<Connection> | undefined): void {
    if (this.closePromise === closing) this.closePromise = undefined
    if (this.closingStartPromise === starting) this.closingStartPromise = undefined
  }

  private async serve(
    request: IncomingMessage,
    response: ServerResponse,
    token: string
  ): Promise<void> {
    const bearerAccepted = request.headers.authorization === `Bearer ${token}`
    const apiKeyAccepted =
      this.options.credentialMode === 'bearer-or-api-key' && request.headers['x-api-key'] === token
    if (!bearerAccepted && !apiKeyAccepted) {
      this.options.onUnauthorized(response)
      return
    }

    const controller = new AbortController()
    const abort = (): void => controller.abort()
    const abortOnRequestClose = (): void => {
      if (request.aborted || !request.complete) abort()
    }
    const abortOnResponseClose = (): void => {
      if (!response.writableEnded) abort()
    }
    request.once('aborted', abort)
    request.once('close', abortOnRequestClose)
    response.once('close', abortOnResponseClose)

    let body: Promise<ProviderLoopbackJsonObject> | undefined
    try {
      const path = request.url ?? '/'
      await this.options.handle(
        Object.freeze({
          method: request.method,
          path,
          url: new URL(path, 'http://127.0.0.1'),
          headers: request.headers,
          signal: controller.signal,
          readJsonObject: () => (body ??= readJsonObject(request, response))
        }),
        response
      )
    } finally {
      request.off('aborted', abort)
      request.off('close', abortOnRequestClose)
      response.off('close', abortOnResponseClose)
    }
  }
}

export {
  ProviderLoopbackHttpHost,
  ProviderLoopbackRequestError,
  providerLoopbackClientError,
  writeProviderLoopbackJson
}
export type { ProviderLoopbackConnection, ProviderLoopbackHttpRequest, ProviderLoopbackJsonObject }
