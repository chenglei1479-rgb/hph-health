import { randomUUID } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { createLogger } from '@aipoch/diagnostics/node'

import {
  observeProviderFailure,
  type ProviderFailureObserver
} from './provider-failure-observation'
import {
  failureDiagnosticFields,
  ProviderLoopbackHttpHost,
  phiErrorResponse,
  writeProviderLoopbackJson as json,
  type ProviderLoopbackHttpRequest
} from './provider-loopback-http-host'
import {
  DeterministicProviderErrorReplay,
  isDeterministicProviderErrorStatus,
  providerErrorClientStatus,
  providerRequestHeadersFingerprint,
  providerRequestFingerprint,
  readBoundedProviderErrorBody
} from './provider-error-replay'
import { fetchProviderRequest } from './provider-fetch'

const WIRE_PATH = {
  'chat-completions': '/v1/chat/completions',
  responses: '/v1/responses'
} as const
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
])
type ProviderErrorSnapshot = Readonly<{
  body: Buffer
  headers: Record<string, string>
  status: number
}>

const providerLog = createLogger('openai-provider')

// #251: an upstream fetch failure used to reach the agent as undici's bare "fetch failed", and the
// cause — the only thing that says whether this was a headers/body timeout, a reset or a DNS failure —
// was dropped. Keep the cause as bounded ASCII identifiers: never the error message, never a request
// or response body, never a URL (a custom endpoint can carry a credential in its query).
const STABLE_DIAGNOSTIC_FIELD = 64
const stableDiagnosticField = (value: unknown): string | undefined => {
  if (typeof value === 'number' && Number.isInteger(value) && Math.abs(value) <= 2_147_483_647)
    return String(value)
  if (typeof value !== 'string' || value.length === 0 || value.length > STABLE_DIAGNOSTIC_FIELD)
    return undefined
  return /^[A-Za-z][A-Za-z0-9_.-]*$/u.test(value) ? value : undefined
}

const causeDiagnosticFields = (error: unknown): Record<string, string> => {
  let cause: unknown
  try {
    cause = (error as { cause?: unknown } | null)?.cause
  } catch {
    return {}
  }
  if (!cause || typeof cause !== 'object') return {}
  const record = cause as { code?: unknown; name?: unknown; errno?: unknown; errors?: unknown }
  // A dual-stack connection refusal arrives as an AggregateError; its first child carries the code.
  const nested = Array.isArray(record.errors) ? record.errors : []
  const nestedCode = nested
    .map((child) => stableDiagnosticField((child as { code?: unknown } | null)?.code))
    .find((value) => value !== undefined)
  const fields: Record<string, string> = {}
  const code = stableDiagnosticField(record.code) ?? nestedCode
  if (code) fields.causeCode = code
  const name = stableDiagnosticField(record.name)
  if (name) fields.causeName = name
  const errno = stableDiagnosticField(record.errno)
  if (errno) fields.causeErrno = errno
  return fields
}

// #251: the only three transport failures this bridge can explain. The status and the code stay what
// `phiErrorResponse` already chose; only the sentence changes, so a caller can act on it.
const PROVIDER_BODY_TIMEOUT_MESSAGE =
  'The model service stopped sending data before the reply finished. Retry the request.'
const PROVIDER_HEADERS_TIMEOUT_MESSAGE =
  'The model service did not respond in time. Retry the request.'
const PROVIDER_UNREACHABLE_MESSAGE =
  'Could not reach the model service. Check your network, proxy or VPN, then retry.'

const providerFailureMessage = (
  error: unknown,
  cause: Record<string, string>
): string | undefined => {
  if (cause.causeCode === 'UND_ERR_BODY_TIMEOUT') return PROVIDER_BODY_TIMEOUT_MESSAGE
  if (cause.causeCode === 'UND_ERR_HEADERS_TIMEOUT') return PROVIDER_HEADERS_TIMEOUT_MESSAGE
  if (error instanceof Error && error.name === 'TypeError' && error.message === 'fetch failed')
    return PROVIDER_UNREACHABLE_MESSAGE
  return undefined
}

export type OpenAiProviderBridgeTarget = Readonly<{
  id: string
  onProviderFailure?: ProviderFailureObserver
  wire: keyof typeof WIRE_PATH
  endpoint: string
  key?: string
  model: string
  resolveHeaders?: () => Promise<Record<string, string>>
  adaptRequest?: (request: Record<string, unknown>) => Record<string, unknown>
}>

export type OpenAiProviderBridgeConnection = Readonly<{
  baseUrl: string
  token: string
}>

const requestHeaders = (request: ProviderLoopbackHttpRequest, key?: string): Headers => {
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    const normalized = name.toLowerCase()
    if (
      HOP_BY_HOP_HEADERS.has(normalized) ||
      // Fetch decodes upstream responses, so it must negotiate its own supported encodings.
      normalized === 'accept-encoding' ||
      normalized === 'authorization' ||
      normalized === 'x-api-key' ||
      normalized.startsWith('sec-fetch-') ||
      value === undefined
    ) {
      continue
    }
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item)
    } else {
      headers.set(name, value)
    }
  }
  if (key) headers.set('authorization', `Bearer ${key}`)
  headers.set('content-type', 'application/json')
  return headers
}

const responseHeaders = (source: Headers): Record<string, string> => {
  const headers: Record<string, string> = {}
  for (const [name, value] of source) {
    if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) headers[name] = value
  }
  return headers
}

export class OpenAiProviderBridge {
  private readonly targets: ReadonlyMap<string, OpenAiProviderBridgeTarget>
  private readonly wire: OpenAiProviderBridgeTarget['wire']
  private readonly host: ProviderLoopbackHttpHost<OpenAiProviderBridgeConnection>
  private target: OpenAiProviderBridgeTarget
  private readonly fetchImpl: typeof fetch
  private readonly deterministicErrors =
    new DeterministicProviderErrorReplay<ProviderErrorSnapshot>()

  constructor(
    targets: readonly OpenAiProviderBridgeTarget[],
    initialTargetId: string,
    fetchImpl: typeof fetch = fetch
  ) {
    this.targets = new Map(targets.map((target) => [target.id, target]))
    const initial = this.targets.get(initialTargetId)
    this.fetchImpl = fetchImpl
    if (!initial) throw new Error('The initial OpenAI bridge target is not registered.')
    this.target = initial
    this.wire = initial.wire
    this.host = new ProviderLoopbackHttpHost({
      diagnosticName: 'openai',
      credentialMode: 'bearer-or-api-key',
      createConnection: (origin, token) => Object.freeze({ baseUrl: origin, token }),
      onUnauthorized: (response) =>
        json(response, 401, {
          error: { type: 'authentication_error', message: 'Unauthorized' }
        }),
      onError: (error, response) => {
        if (response.headersSent) {
          response.destroy(error instanceof Error ? error : undefined)
          return
        }
        const { status, body } = phiErrorResponse(error, 'OpenAI provider request failed.')
        json(response, status, body)
      },
      handle: (request, response) => this.handle(request, response)
    })
  }

  setTarget(targetId: string): boolean {
    const target = this.targets.get(targetId)
    if (!target || target.wire !== this.wire) return false
    if (this.target.id !== target.id) this.deterministicErrors.clear()
    this.target = target
    return true
  }

  clearErrorReplay(): void {
    this.deterministicErrors.clear()
  }

  async start(): Promise<OpenAiProviderBridgeConnection> {
    return this.host.start()
  }

  async close(): Promise<void> {
    this.deterministicErrors.clear()
    await this.host.close()
  }

  private async handle(
    request: ProviderLoopbackHttpRequest,
    response: ServerResponse
  ): Promise<void> {
    if (request.method !== 'POST') {
      json(response, 405, {
        error: { type: 'invalid_request_error', message: 'Method not allowed' }
      })
      return
    }

    const requestUrl = request.url
    if (requestUrl.pathname !== WIRE_PATH[this.wire]) {
      json(response, 404, { error: { type: 'not_found_error', message: 'Not found' } })
      return
    }

    const target = this.target
    const parsed = await request.readJsonObject()
    const adapted = target.adaptRequest?.(parsed) ?? parsed
    const endpoint = new URL(target.endpoint)
    if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') {
      throw new Error('The OpenAI provider target has no valid endpoint URL.')
    }
    const body = JSON.stringify({ ...adapted, model: target.model })
    const headersToForward = requestHeaders(request, target.key)
    if (target.resolveHeaders) {
      // Subscription identity belongs to main, never the child or its forwarded headers.
      const resolved = await target.resolveHeaders()
      for (const [name, value] of Object.entries(resolved)) headersToForward.set(name, value)
    }
    const replayKey = providerRequestFingerprint(
      target.id,
      requestUrl.pathname,
      providerRequestHeadersFingerprint(headersToForward),
      body
    )
    const replay = this.deterministicErrors.get(replayKey)
    if (replay) {
      response.writeHead(replay.status, replay.headers)
      response.end(replay.body)
      return
    }

    const requestId = randomUUID()
    const startedAt = Date.now()
    let firstByteAt: number | undefined
    try {
      const upstream = await fetchProviderRequest(this.fetchImpl, endpoint, {
        method: 'POST',
        headers: headersToForward,
        body,
        signal: request.signal
      })
      const headers = responseHeaders(upstream.headers)
      if (isDeterministicProviderErrorStatus(upstream.status)) {
        const upstreamBody = await readBoundedProviderErrorBody(upstream, {
          signal: request.signal
        })
        await observeProviderFailure(
          target.onProviderFailure,
          {
            model: target.model,
            endpoint: target.wire === 'responses' ? 'responses' : 'openai',
            startedAt
          },
          upstream.status,
          upstreamBody.complete ? upstreamBody.body.toString('utf8') : undefined
        )
        delete headers['content-encoding']
        if (!upstreamBody.complete) headers['content-type'] = 'application/json'
        const bodyToReplay = upstreamBody.complete
          ? upstreamBody.body
          : Buffer.from(
              JSON.stringify({
                error: {
                  type: 'invalid_request_error',
                  message: `Provider request failed with status ${upstream.status}`
                }
              })
            )
        const snapshot = {
          body: bodyToReplay,
          headers: {
            ...headers,
            'content-length': String(bodyToReplay.byteLength),
            'x-open-science-upstream-status': String(upstream.status)
          },
          status: providerErrorClientStatus(upstream.status)
        }
        this.deterministicErrors.remember(replayKey, upstream.status, snapshot)
        response.writeHead(snapshot.status, snapshot.headers)
        response.end(snapshot.body)
        return
      }
      response.statusCode = upstream.status
      response.statusMessage = upstream.statusText
      for (const [name, value] of Object.entries(headers)) response.setHeader(name, value)
      if (!upstream.body) {
        response.end()
        return
      }
      await pipeline(
        Readable.from(
          (async function* (): AsyncGenerator<Uint8Array> {
            for await (const chunk of upstream.body as AsyncIterable<Uint8Array>) {
              if (firstByteAt === undefined) firstByteAt = Date.now()
              yield chunk
            }
          })()
        ),
        response
      )
    } catch (error) {
      // The client already has the upstream status line, so the only honest signal left is a reset.
      // Before that point the bridge can still answer with a status the agent will carry to the user.
      const responseStarted = response.headersSent
      const cause = causeDiagnosticFields(error)
      providerLog.warn('provider request failed', {
        bridge: 'openai',
        target: target.id,
        wire: this.wire,
        path: requestUrl.pathname,
        requestId,
        durationMs: Date.now() - startedAt,
        phase: responseStarted ? 'stream' : 'before-response',
        responseStarted,
        ...(firstByteAt === undefined ? {} : { firstByteMs: firstByteAt - startedAt }),
        ...failureDiagnosticFields(error),
        ...cause
      })
      if (responseStarted) {
        response.destroy(error instanceof Error ? error : undefined)
        return
      }
      const { status, body: errorBody } = phiErrorResponse(error, 'OpenAI provider request failed.')
      const message = providerFailureMessage(error, cause)
      if (message) errorBody.error.message = message
      json(response, status, errorBody)
    }
  }
}
