import { describe, expect, it, vi } from 'vitest'

import { detectStorageLocationRisk, type WindowsVolumeInfo } from './location-risk'

const windowsRisk = async (
  path: string,
  volume: WindowsVolumeInfo | undefined,
  env: NodeJS.ProcessEnv = {}
): Promise<string> => {
  const result = await detectStorageLocationRisk(path, {
    platform: 'win32',
    env,
    inspectWindowsVolume: async () => volume
  })
  return result.kind
}

describe('detectStorageLocationRisk', () => {
  it('classifies a fixed local volume as local', async () => {
    await expect(windowsRisk('C:\\Users\\me\\MedResearch-Agent', { driveType: 3 })).resolves.toBe(
      'local'
    )
  })

  it.each([
    [2, 'removable'],
    [4, 'network'],
    [5, 'removable']
  ])('maps Windows drive type %i to %s', async (driveType, expected) => {
    await expect(
      windowsRisk('D:\\MedResearch-Agent', { driveType: driveType as number })
    ).resolves.toBe(expected)
  })

  it('treats UNC paths as network without probing a volume', async () => {
    const inspect = vi.fn()
    const result = await detectStorageLocationRisk('\\\\server\\share\\MedResearch-Agent', {
      platform: 'win32',
      env: {},
      inspectWindowsVolume: inspect
    })
    expect(result).toEqual({ kind: 'network' })
    expect(inspect).not.toHaveBeenCalled()
  })

  it('detects OneDrive through its environment roots', async () => {
    const result = await detectStorageLocationRisk('C:\\Users\\me\\OneDrive\\Papers', {
      platform: 'win32',
      env: { OneDrive: 'C:\\Users\\me\\OneDrive' },
      inspectWindowsVolume: async () => ({ driveType: 3 })
    })
    expect(result).toEqual({ kind: 'cloud-sync', provider: 'OneDrive' })
  })

  it('detects OneDrive for an organization folder', async () => {
    const result = await detectStorageLocationRisk('C:\\Users\\me\\OneDrive - Clinic\\Papers', {
      platform: 'win32',
      env: {},
      inspectWindowsVolume: async () => ({ driveType: 3 })
    })
    expect(result).toEqual({ kind: 'cloud-sync', provider: 'OneDrive' })
  })

  it('detects Dropbox', async () => {
    await expect(windowsRisk('C:\\Users\\me\\Dropbox\\Research', { driveType: 3 })).resolves.toBe(
      'cloud-sync'
    )
  })

  it.each(['Google Drive', 'My Drive', 'マイドライブ', 'GoogleDrive'])(
    'detects the Google Drive folder name %s',
    async (folder) => {
      await expect(
        windowsRisk(`C:\\Users\\me\\${folder}\\Research`, { driveType: 3 })
      ).resolves.toBe('cloud-sync')
    }
  )

  it('detects a drive labelled Google Drive', async () => {
    const result = await detectStorageLocationRisk('G:\\Research', {
      platform: 'win32',
      env: {},
      inspectWindowsVolume: async () => ({ driveType: 3, label: 'Google Drive' })
    })
    expect(result).toEqual({ kind: 'cloud-sync', provider: 'Google Drive' })
  })

  it('detects iCloud Mobile Documents and iCloudDrive folders', async () => {
    for (const path of [
      '/Users/me/Library/Mobile Documents/com~apple~CloudDocs/Research',
      '/Users/me/iCloudDrive/Research'
    ]) {
      const result = await detectStorageLocationRisk(path, { platform: 'darwin', env: {} })
      expect(result).toEqual({ kind: 'cloud-sync', provider: 'iCloud Drive' })
    }
  })

  it('maps a failed Windows probe to unknown instead of throwing', async () => {
    await expect(windowsRisk('D:\\MedResearch-Agent', undefined)).resolves.toBe('unknown')
  })

  it('maps a thrown probe to unknown', async () => {
    const result = await detectStorageLocationRisk('D:\\MedResearch-Agent', {
      platform: 'win32',
      env: {},
      inspectWindowsVolume: async () => {
        throw new Error('PowerShell unavailable')
      }
    })
    expect(result).toEqual({ kind: 'unknown' })
  })

  it('treats a non-boot /Volumes mount as removable on macOS', async () => {
    const result = await detectStorageLocationRisk('/Volumes/External/MedResearch-Agent', {
      platform: 'darwin',
      env: {},
      deviceId: (path) => (path === '/' ? 1 : 2)
    })
    expect(result).toEqual({ kind: 'removable' })
  })

  it('keeps the boot volume local on macOS', async () => {
    const result = await detectStorageLocationRisk(
      '/Volumes/Macintosh HD/Users/me/MedResearch-Agent',
      {
        platform: 'darwin',
        env: {},
        deviceId: () => 1
      }
    )
    expect(result).toEqual({ kind: 'local' })
  })

  it('maps unknown macOS device ids to unknown', async () => {
    const result = await detectStorageLocationRisk('/Volumes/External/MedResearch-Agent', {
      platform: 'darwin',
      env: {},
      deviceId: () => undefined
    })
    expect(result).toEqual({ kind: 'unknown' })
  })
})
