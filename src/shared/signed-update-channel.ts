// Pure rules for DRA's own electron-updater feed. No network and no Electron APIs.

export const DRA_UPDATE_FEED_PLACEHOLDER = 'https://updates.REPLACE_ME/dra/'

export const UPDATE_SIGNATURE_REJECTED =
  'The update signature does not match the pinned publisher. The installer was not started.'

export const UPDATE_FEED_UNREADABLE = 'The update feed could not be verified.'

export type UpdateChannel = 'beta' | 'stable'

export type DraSigningConfig = {
  updateFeedUrl: string
  macTeamId: string
  windowsPublisherName: string
  requireNotarization: boolean
  requestedChannel: UpdateChannel
}

export type LatestYmlFeed = {
  version: string
  channel: UpdateChannel
  stagingPercentage: number
}

export type SignatureEvidence = {
  platform: 'darwin' | 'win32' | 'linux' | 'other'
  teamId?: string
  notarized?: boolean
  publisherName?: string
  signatureStatus?: string
}

const PLACEHOLDER_MARKERS = ['REPLACE_ME', '.invalid']

export const isPlaceholderValue = (value: string): boolean => {
  const trimmed = value.trim().toLowerCase()
  return (
    trimmed.length === 0 ||
    PLACEHOLDER_MARKERS.some((marker) => trimmed.includes(marker.toLowerCase()))
  )
}

export const updatesDisabledBySigningConfig = (config: DraSigningConfig): boolean =>
  isPlaceholderValue(config.updateFeedUrl) ||
  isPlaceholderValue(config.macTeamId) ||
  isPlaceholderValue(config.windowsPublisherName) ||
  !config.updateFeedUrl.trim().toLowerCase().startsWith('https://')

export const parseDraSigningConfig = (value: unknown): DraSigningConfig => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid DRA signing configuration.')
  }
  const config = value as Record<string, unknown>
  const allowed = [
    'updateFeedUrl',
    'macTeamId',
    'windowsPublisherName',
    'requireNotarization',
    'requestedChannel'
  ]
  if (Object.keys(config).some((key) => !allowed.includes(key))) {
    throw new Error('Invalid DRA signing configuration.')
  }
  if (
    typeof config.updateFeedUrl !== 'string' ||
    typeof config.macTeamId !== 'string' ||
    typeof config.windowsPublisherName !== 'string' ||
    typeof config.requireNotarization !== 'boolean' ||
    (config.requestedChannel !== 'beta' && config.requestedChannel !== 'stable')
  ) {
    throw new Error('Invalid DRA signing configuration.')
  }
  return {
    updateFeedUrl: config.updateFeedUrl.trim(),
    macTeamId: config.macTeamId.trim(),
    windowsPublisherName: config.windowsPublisherName.trim(),
    requireNotarization: config.requireNotarization,
    requestedChannel: config.requestedChannel
  }
}

// latest.yml carries both the rollout percent and the channel. electron-updater still downloads
// latest.yml; beta versus stable is a field in that file, not a second feed name.
export const parseLatestYml = (text: string): LatestYmlFeed => {
  const version = /^version:\s*['"]?([^'"\n#]+)['"]?\s*$/m.exec(text)?.[1]?.trim()
  const channel = /^channel:\s*['"]?(beta|stable)['"]?\s*$/m.exec(text)?.[1]
  const staging = /^stagingPercentage:\s*(\d+)\s*$/m.exec(text)?.[1]
  if (!version || (channel !== 'beta' && channel !== 'stable') || staging === undefined) {
    throw new Error('latest.yml is missing version, channel, or stagingPercentage.')
  }
  const stagingPercentage = Number(staging)
  if (!Number.isInteger(stagingPercentage) || stagingPercentage < 0 || stagingPercentage > 100) {
    throw new Error('stagingPercentage must be an integer from 0 to 100.')
  }
  return { version, channel, stagingPercentage }
}

export const channelAllowsUpdate = (
  feedChannel: UpdateChannel,
  requested: UpdateChannel
): boolean => feedChannel === requested

// Stable bucket in 0..99. The same install id always lands in the same cohort.
export const rolloutBucket = (installId: string): number => {
  let hash = 2166136261
  for (const char of installId) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % 100
}

// A missing install id is outside every partial rollout. 100% still includes every install.
export const isStagedRolloutEligible = (
  installId: string | undefined,
  stagingPercentage: number
): boolean => {
  if (!Number.isInteger(stagingPercentage) || stagingPercentage < 0 || stagingPercentage > 100) {
    return false
  }
  if (stagingPercentage === 100) return true
  if (stagingPercentage === 0 || !installId) return false
  return rolloutBucket(installId) < stagingPercentage
}

const windowsCommonName = (subject: string): string | undefined =>
  /(?:^|,\s*)CN=([^,]+)/.exec(subject)?.[1]?.trim()

export const signatureSatisfiesPolicy = (
  evidence: SignatureEvidence,
  config: Pick<DraSigningConfig, 'macTeamId' | 'windowsPublisherName' | 'requireNotarization'>
): { ok: true } | { ok: false; reason: string } => {
  if (
    updatesDisabledBySigningConfig({
      ...config,
      updateFeedUrl: 'https://updates.example/dra/',
      requestedChannel: 'stable'
    })
  ) {
    return { ok: false, reason: UPDATE_SIGNATURE_REJECTED }
  }
  if (evidence.platform === 'darwin') {
    const teamMatches = evidence.teamId === config.macTeamId
    const notarized = !config.requireNotarization || evidence.notarized === true
    if (!teamMatches || !notarized) return { ok: false, reason: UPDATE_SIGNATURE_REJECTED }
    return { ok: true }
  }
  if (evidence.platform === 'win32') {
    const publisher = evidence.publisherName?.trim() ?? ''
    const pinned = config.windowsPublisherName
    const matches = publisher === pinned || windowsCommonName(publisher) === pinned
    if (evidence.signatureStatus !== 'Valid' || !matches) {
      return { ok: false, reason: UPDATE_SIGNATURE_REJECTED }
    }
    return { ok: true }
  }
  if (evidence.platform === 'linux') return { ok: true }
  return { ok: false, reason: UPDATE_SIGNATURE_REJECTED }
}
