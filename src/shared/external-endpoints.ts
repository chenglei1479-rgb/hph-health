import catalogJson from '../../resources/external-endpoints.json'

export type ExternalEndpointRequirement = 'required' | 'optional'

export type ExternalEndpointEntry = {
  id: string
  kind: 'static' | 'user-configured-model'
  host: string | null
  requirement: ExternalEndpointRequirement
  defaultEnabled: boolean
  dataSentJa: string
  recipientJa: string
  companyJa: string
  countryJa: string
  purposeJa: string
  exampleHosts?: string[]
}

export type OutboundDecision =
  { allowed: true; id: string; host: string } | { allowed: false; host: string }

const entries = catalogJson.entries as ExternalEndpointEntry[]

const staticHosts = new Map<string, ExternalEndpointEntry>()
let modelEntry: ExternalEndpointEntry | undefined
for (const entry of entries) {
  if (entry.kind === 'user-configured-model') modelEntry = entry
  if (entry.host) staticHosts.set(entry.host.toLowerCase(), entry)
}

export const externalEndpointEntries = (): readonly ExternalEndpointEntry[] => entries

export const userConfiguredModelEntry = (): ExternalEndpointEntry => {
  if (!modelEntry) throw new Error('Missing user-configured model endpoint entry.')
  return modelEntry
}

export const hostFromOutboundUrl = (value: string): string | undefined => {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    return url.hostname.toLowerCase()
  } catch {
    return undefined
  }
}

const isLoopback = (host: string): boolean =>
  host === 'localhost' ||
  host.endsWith('.localhost') ||
  host === '::1' ||
  host === '0.0.0.0' ||
  host.startsWith('127.')

export const decideOutboundUrl = (
  value: string,
  modelHosts: ReadonlySet<string> = new Set()
): OutboundDecision => {
  const host = hostFromOutboundUrl(value)
  if (!host) return { allowed: true, id: 'non-http', host: '' }
  if (isLoopback(host)) return { allowed: true, id: 'loopback', host }
  const listed = staticHosts.get(host)
  if (listed) return { allowed: true, id: listed.id, host }
  if (modelHosts.has(host)) return { allowed: true, id: userConfiguredModelEntry().id, host }
  return { allowed: false, host }
}
