import { execFile } from 'node:child_process'
import { statSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

import type { StorageLocationRisk } from '../../shared/storage'

type WindowsVolumeInfo = Readonly<{
  driveType: number
  label?: string
}>

type LocationRiskDependencies = Readonly<{
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  home?: string
  // Returns undefined when the volume cannot be inspected; callers then report 'unknown'.
  inspectWindowsVolume?: (root: string) => Promise<WindowsVolumeInfo | undefined>
  // Device ids for the path and the boot volume. A different device under /Volumes is external.
  deviceId?: (path: string) => number | undefined
}>

const isInside = (parent: string, child: string, platform: NodeJS.Platform): boolean => {
  if (!parent) return false
  const normalize = (value: string): string =>
    platform === 'win32' ? value.replaceAll('/', '\\').toLowerCase() : value
  const parentPath = normalize(parent).replace(/[\\/]+$/, '')
  const childPath = normalize(child)
  return (
    childPath === parentPath ||
    childPath.startsWith(`${parentPath}/`) ||
    childPath.startsWith(`${parentPath}\\`)
  )
}

const segments = (path: string): string[] =>
  path
    .split(/[\\/]+/)
    .map((segment) => segment.trim())
    .filter(Boolean)

const GOOGLE_DRIVE_SEGMENTS = new Set(['google drive', 'googledrive', 'my drive', 'マイドライブ'])
const ICLOUD_SEGMENTS = new Set(['icloud drive', 'iclouddrive', 'mobile documents'])

const detectCloudSyncProvider = (
  path: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform
): string | undefined => {
  // OneDrive roots are authoritative even when the folder name was localized or customised.
  for (const key of ['OneDrive', 'OneDriveCommercial', 'OneDriveConsumer'] as const) {
    const root = env[key]
    if (root && isInside(root, path, platform)) return 'OneDrive'
  }

  const parts = segments(path)
  const lower = parts.map((part) => part.toLowerCase())
  if (lower.some((part) => part === 'onedrive' || part.startsWith('onedrive - '))) return 'OneDrive'
  if (lower.some((part) => part === 'dropbox')) return 'Dropbox'
  if (lower.some((part) => GOOGLE_DRIVE_SEGMENTS.has(part))) return 'Google Drive'
  // macOS mounts iCloud Drive under ~/Library/Mobile Documents. The CloudDocs segment is a
  // locale-independent signal for the iCloud Drive container itself.
  if (lower.some((part) => ICLOUD_SEGMENTS.has(part))) return 'iCloud Drive'
  if (lower.includes('com~apple~clouddocs')) return 'iCloud Drive'
  return undefined
}

const windowsVolumeProbe = (root: string): Promise<WindowsVolumeInfo | undefined> =>
  new Promise((resolveProbe) => {
    const literal = root.replaceAll("'", "''")
    const script = [
      "$ErrorActionPreference = 'Stop'",
      '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
      `$drive = [System.IO.DriveInfo]::new('${literal}')`,
      '[ordered]@{ driveType = [int]$drive.DriveType; label = $drive.VolumeLabel } | ConvertTo-Json -Compress'
    ].join('; ')
    execFile(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64')
      ],
      { windowsHide: true, timeout: 5_000 },
      (error, stdout) => {
        if (error) {
          resolveProbe(undefined)
          return
        }
        try {
          const value = JSON.parse(String(stdout)) as Record<string, unknown>
          if (typeof value.driveType !== 'number') {
            resolveProbe(undefined)
            return
          }
          resolveProbe({
            driveType: value.driveType,
            ...(typeof value.label === 'string' ? { label: value.label } : {})
          })
        } catch {
          resolveProbe(undefined)
        }
      }
    )
  })

const windowsRoot = (path: string): string | undefined => {
  const match = /^([a-z]:)[\\/]/i.exec(path)
  return match ? `${match[1].toUpperCase()}\\` : undefined
}

const macVolumeRoot = (path: string): string | undefined => {
  const match = /^\/Volumes\/([^/]+)/.exec(path)
  return match ? `/Volumes/${match[1]}` : undefined
}

const deviceId = (path: string): number | undefined => {
  try {
    return statSync(path).dev
  } catch {
    return undefined
  }
}

// Classifies the physical/cloud risk of a candidate data location. Detection is advisory: a probe
// failure becomes 'unknown' and never blocks the user or surfaces an error.
const detectStorageLocationRisk = async (
  path: string,
  dependencies: LocationRiskDependencies = {}
): Promise<StorageLocationRisk> => {
  const platform = dependencies.platform ?? process.platform
  const env = dependencies.env ?? process.env
  const home = dependencies.home ?? homedir()
  if (!path || path.trim() === '') return { kind: 'unknown' }
  const candidate = platform === 'win32' ? resolve(path) : path.trim()

  try {
    const cloudProvider = detectCloudSyncProvider(candidate, { ...env, HOME: home }, platform)
    if (cloudProvider) return { kind: 'cloud-sync', provider: cloudProvider }

    if (/^[\\/]{2}[^\\/]/.test(candidate)) return { kind: 'network' }

    if (platform === 'win32') {
      const root = windowsRoot(candidate)
      if (!root) return { kind: 'local' }
      const inspect = dependencies.inspectWindowsVolume ?? windowsVolumeProbe
      const volume = await inspect(root)
      if (!volume) return { kind: 'unknown' }
      if (volume.label?.toLowerCase().includes('google drive')) {
        return { kind: 'cloud-sync', provider: 'Google Drive' }
      }
      // DRIVE_REMOVABLE = 2, DRIVE_REMOTE = 4, DRIVE_CDROM = 5.
      if (volume.driveType === 2 || volume.driveType === 5) return { kind: 'removable' }
      if (volume.driveType === 4) return { kind: 'network' }
      return { kind: 'local' }
    }

    if (platform === 'darwin') {
      const volumeRoot = macVolumeRoot(candidate)
      if (!volumeRoot) return { kind: 'local' }
      const readDevice = dependencies.deviceId ?? deviceId
      const volumeDevice = readDevice(volumeRoot)
      const bootDevice = readDevice('/')
      if (volumeDevice === undefined || bootDevice === undefined) return { kind: 'unknown' }
      return volumeDevice === bootDevice ? { kind: 'local' } : { kind: 'removable' }
    }

    return { kind: 'local' }
  } catch {
    return { kind: 'unknown' }
  }
}

export { detectStorageLocationRisk, detectCloudSyncProvider }
export type { LocationRiskDependencies, WindowsVolumeInfo }
