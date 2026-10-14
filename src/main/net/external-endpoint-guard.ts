import { createLogger } from '../logger'
import { decideOutboundUrl, hostFromOutboundUrl } from '../../shared/external-endpoints'

const log = createLogger('external-endpoints')
const modelHosts = new Set<string>()

export const registerUserModelEndpointUrl = (value: string): void => {
  const host = hostFromOutboundUrl(value)
  if (host) modelHosts.add(host)
}

export const resetUserModelEndpointHosts = (): void => {
  modelHosts.clear()
}

export const outboundGuardEnabled = (): boolean => {
  if (process.env.DRA_EXTERNAL_ENDPOINT_GUARD === '0') return false
  if (process.env.DRA_EXTERNAL_ENDPOINT_GUARD === '1') return true
  return process.versions.electron !== undefined && process.type === 'browser'
}

export const enforceOutboundUrl = (value: string): void => {
  const decision = decideOutboundUrl(value, modelHosts)
  if (decision.allowed) return
  log.warn('blocked outbound request', { host: decision.host })
  throw new Error(`Blocked outbound request to ${decision.host}`)
}

let installed = false

export const installExternalEndpointGuard = (): void => {
  if (installed || !outboundGuardEnabled()) return
  installed = true
  const original = globalThis.fetch.bind(globalThis)
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url
    enforceOutboundUrl(url)
    return original(input, init)
  }) as typeof fetch
}
