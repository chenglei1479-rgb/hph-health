import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  UPDATE_FEED_UNREADABLE,
  UPDATE_SIGNATURE_REJECTED,
  type DraSigningConfig
} from '../../shared/signed-update-channel'
import { createUpdateStrategy } from './create-strategy'
import { ElectronUpdaterStrategy } from './electron-updater-strategy'
import { DisabledUpdateStrategy } from './disabled-strategy'

vi.mock('electron', () => ({
  app: {
    getPath: () => '/Applications/DRA.app/Contents/MacOS/DRA',
    getVersion: () => '0.0.0',
    isPackaged: false
  },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { openExternal: vi.fn(async () => {}), openPath: vi.fn(async () => '') }
}))
vi.mock('electron-updater', () => ({
  AppImageUpdater: class {},
  DebUpdater: class {},
  CancellationToken: class {
    cancelled = false
    cancel(): void {
      this.cancelled = true
    }
  },
  autoUpdater: {
    on: () => undefined,
    setFeedURL: () => undefined,
    autoDownload: true,
    autoInstallOnAppQuit: true
  }
}))
vi.mock('../logger', async (importOriginal) => {
  const original = await importOriginal<typeof import('../logger')>()
  return {
    ...original,
    createLogger: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} })
  }
})

class FakeUpdater extends EventEmitter {
  autoDownload = true
  autoInstallOnAppQuit = true
  setFeedURL = vi.fn()
  checkForUpdates = vi.fn(async () => {
    this.emit('update-available', { version: '9.0.0', downloadedFile: '/tmp/DRA-setup.exe' })
  })
  downloadUpdate = vi.fn(async () => {
    this.emit('update-downloaded', { downloadedFile: '/tmp/DRA-setup.exe' })
  })
  quitAndInstall = vi.fn()
}

const signing = (): DraSigningConfig => ({
  updateFeedUrl: 'https://updates.dra.example/dra/',
  macTeamId: 'TEAMID1234',
  windowsPublisherName: 'DRA Publisher',
  requireNotarization: true,
  requestedChannel: 'stable'
})

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('signed update channel integration', () => {
  it('disables updates when the signing file is still a placeholder', () => {
    const root = mkdtempSync(join(tmpdir(), 'dra-signing-'))
    roots.push(root)
    const file = join(root, 'dra-signing.yml')
    writeFileSync(
      file,
      'updateFeedUrl: https://updates.REPLACE_ME/dra/\nmacTeamId: REPLACE_ME\nwindowsPublisherName: REPLACE_ME\nrequireNotarization: true\nrequestedChannel: stable\n'
    )
    const strategy = createUpdateStrategy('win32', { signingConfigPath: file, version: '1.0.0' })
    expect(strategy).toBeInstanceOf(DisabledUpdateStrategy)
    expect(strategy.getStatus()).toEqual({ state: 'disabled', current: '1.0.0' })
  })

  it('does not install when the feed channel or rollout excludes this install', async () => {
    const updater = new FakeUpdater()
    const strategy = new ElectronUpdaterStrategy({
      updater,
      currentVersion: '1.0.0',
      broadcast: vi.fn(),
      fetchImpl: vi.fn(async () => {
        throw new Error('notes are optional')
      }) as unknown as typeof fetch,
      rollout: {
        installId: 'install-1',
        requestedChannel: 'stable',
        readFeed: async () => ({ version: '9.0.0', channel: 'beta', stagingPercentage: 100 })
      }
    })

    const status = await strategy.check()
    expect(status.state).toBe('up-to-date')
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
    expect(updater.autoInstallOnAppQuit).toBe(false)
  })

  it('reports an unreadable feed without installing', async () => {
    const updater = new FakeUpdater()
    const strategy = new ElectronUpdaterStrategy({
      updater,
      currentVersion: '1.0.0',
      broadcast: vi.fn(),
      rollout: {
        installId: 'install-1',
        requestedChannel: 'stable',
        readFeed: async () => {
          throw new Error('offline')
        }
      }
    })
    await expect(strategy.check()).resolves.toMatchObject({
      state: 'error',
      error: UPDATE_FEED_UNREADABLE
    })
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('refuses to install when the signature check fails and installs only after it passes', async () => {
    const updater = new FakeUpdater()
    const verifySignature = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: 'team mismatch' })
      .mockResolvedValueOnce({ ok: true })
    const strategy = new ElectronUpdaterStrategy({
      updater,
      currentVersion: '1.0.0',
      broadcast: vi.fn(),
      fetchImpl: vi.fn(async () => {
        throw new Error('notes are optional')
      }) as unknown as typeof fetch,
      verifySignature
    })
    updater.emit('update-available', { version: '9.0.0' })
    await strategy.download()
    const rejected = await strategy.apply()
    expect(rejected.state).toBe('ready')
    expect(rejected.error).toBe(UPDATE_SIGNATURE_REJECTED)
    expect(updater.quitAndInstall).not.toHaveBeenCalled()

    await strategy.apply()
    expect(updater.quitAndInstall).toHaveBeenCalledWith(true, true)
  })

  it('configures a real generic feed without enabling a placeholder publisher', () => {
    const strategy = createUpdateStrategy('win32', {
      signingConfig: signing(),
      rolloutInstallId: 'install-1',
      version: '1.0.0'
    })
    expect(strategy).toBeInstanceOf(ElectronUpdaterStrategy)
  })
})
