export type DraUpdateDeployment = {
  provider: 'generic'
  url: string
  manifestUrl: string
  publisherName: string
  channel: 'latest'
}

// Distinct from a missing file. A missing file may follow the build default; this must not.
export type ExplicitlyDisabledDraUpdate = {
  enabled: false
}

export type DraUpdateDeploymentRead =
  | { state: 'missing' }
  | { state: 'disabled' }
  | { state: 'configured'; deployment: DraUpdateDeployment }

export const isExplicitlyDisabledDraUpdate = (
  value: DraUpdateDeployment | ExplicitlyDisabledDraUpdate
): value is ExplicitlyDisabledDraUpdate => 'enabled' in value && value.enabled === false

// Administrative deployment config, never supplied by a renderer or remote manifest.
export const parseDraUpdateDeployment = (
  value: unknown
): DraUpdateDeployment | ExplicitlyDisabledDraUpdate => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid DRA update configuration.')
  const config = value as Record<string, unknown>
  if (config.enabled === false && Object.keys(config).length === 1) return { enabled: false }
  if (
    Object.keys(config).some(
      (k) => !['enabled', 'provider', 'url', 'manifestUrl', 'publisherName', 'channel'].includes(k)
    ) ||
    config.enabled !== true ||
    config.provider !== 'generic' ||
    config.channel !== 'latest' ||
    typeof config.publisherName !== 'string' ||
    !config.publisherName.trim() ||
    typeof config.url !== 'string' ||
    typeof config.manifestUrl !== 'string'
  )
    throw new Error('Incomplete DRA update configuration.')
  const urls = [new URL(config.url), new URL(config.manifestUrl)]
  for (const url of urls) {
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.hostname === 'statics.aipoch.com' ||
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname.endsWith('.invalid')
    )
      throw new Error('DRA updates require an operator-controlled HTTPS server.')
  }
  if (urls[0].origin !== urls[1].origin)
    throw new Error('Update feed and release manifest must use the same server.')
  return {
    provider: 'generic',
    url: urls[0].href,
    manifestUrl: urls[1].href,
    publisherName: config.publisherName.trim(),
    channel: 'latest'
  }
}
