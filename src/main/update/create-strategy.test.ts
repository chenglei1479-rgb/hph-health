import { beforeEach, describe, expect, it, vi } from 'vitest'

const spawnSync = vi.hoisted(() => vi.fn())
const quitAndInstall = vi.hoisted(() => vi.fn())
const setFeedURL = vi.hoisted(() => vi.fn())
const updaterListeners = vi.hoisted(() => new Map<string, (...args: unknown[]) => void>())
const loggerMocks = vi.hoisted(() => {
  const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  return { log, createLogger: vi.fn(() => log) }
})

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawnSync
}))
vi.mock('../logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../logger')>()),
  createLogger: loggerMocks.createLogger
}))

// createUpdateStrategy constructs a concrete strategy per platform. Both strategies touch native
// modules at construction (UpdateService reads app.getVersion(); ElectronUpdaterStrategy subscribes to
// autoUpdater), so stub them enough to instantiate without a real Electron runtime.
vi.mock('electron', () => ({
  app: {
    getPath: () => '/Applications/Open-Science.app/Contents/MacOS/Open-Science',
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
    setFeedURL,
    on: (event: string, listener: (...args: unknown[]) => void) => {
      updaterListeners.set(event, listener)
    },
    downloadUpdate: async () => {
      updaterListeners.get('update-downloaded')?.()
    },
    autoDownload: true,
    autoInstallOnAppQuit: true,
    quitAndInstall
  }
}))

import { createUpdateStrategy } from './create-strategy'
import { ElectronUpdaterStrategy } from './electron-updater-strategy'
import { UpdateService } from './service'
import { DisabledUpdateStrategy } from './disabled-strategy'
import { APP } from '../../shared/app-config'

vi.mock('../../shared/app-config', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../shared/app-config')>()
  return { APP: { ...original.APP, update: { ...original.APP.update, enabled: true } } }
})

describe('createUpdateStrategy', () => {
  it('configures the supplied DRA server instead of reading a legacy default feed', () => {
    const deployment = {
      provider: 'generic',
      url: 'https://updates.dra.example/stable/',
      manifestUrl: 'https://updates.dra.example/stable/version.json',
      publisherName: 'DRA Publisher',
      channel: 'latest'
    } as const
    expect(createUpdateStrategy('win32', { deployment })).toBeInstanceOf(ElectronUpdaterStrategy)
    expect(setFeedURL).toHaveBeenCalledWith(deployment)
  })
  it('blocks every update action without constructing the updater when the build policy is disabled', async () => {
    const strategy = createUpdateStrategy('win32', { updatesEnabled: false, version: '0.1.29' })
    expect(strategy).toBeInstanceOf(DisabledUpdateStrategy)
    expect(strategy.getStatus()).toEqual({ state: 'disabled', current: '0.1.29' })
    for (const action of ['check', 'download', 'cancel', 'apply'] as const) {
      expect(await strategy[action]()).toEqual({ state: 'disabled', current: '0.1.29' })
    }
    expect(updaterListeners.size).toBe(0)
    expect(quitAndInstall).not.toHaveBeenCalled()
  })

  it('defaults to the disabled strategy when the build configuration disables updates', () => {
    const enabled = APP.update.enabled
    Object.assign(APP.update, { enabled: false })
    try {
      expect(createUpdateStrategy('win32')).toBeInstanceOf(DisabledUpdateStrategy)
    } finally {
      Object.assign(APP.update, { enabled })
    }
  })
  beforeEach(() => {
    setFeedURL.mockClear()
    updaterListeners.clear()
    spawnSync.mockReset()
    quitAndInstall.mockReset()
    updaterListeners.clear()
    loggerMocks.createLogger.mockClear()
    for (const log of Object.values(loggerMocks.log)) log.mockClear()
    spawnSync.mockReturnValue({
      status: 0,
      stdout: '',
      stderr: 'Identifier=com.aipoch.medresearch-agent\nTeamIdentifier=87G9WFU9H3\n'
    })
  })

  it('uses ElectronUpdaterStrategy on win32', () => {
    expect(createUpdateStrategy('win32')).toBeInstanceOf(ElectronUpdaterStrategy)
  })

  it('uses ElectronUpdaterStrategy on linux', () => {
    expect(createUpdateStrategy('linux')).toBeInstanceOf(ElectronUpdaterStrategy)
  })

  it.each([
    ['in-place', 'win32', { isPackaged: true }],
    ['manifest', 'darwin', { isPackaged: false }]
  ] as const)(
    'injects the production update logger into the %s strategy',
    async (_, platform, opts) => {
      const strategy = createUpdateStrategy(platform, opts)
      if (strategy instanceof ElectronUpdaterStrategy) {
        updaterListeners.get('update-available')?.({})
        await strategy.download()
      }

      await strategy.apply()

      expect(loggerMocks.createLogger).toHaveBeenCalledWith('update')
      expect(loggerMocks.log.info).toHaveBeenCalledWith(
        'operation completed',
        expect.objectContaining({ operation: 'update-apply', outcome: 'completed' })
      )
    }
  )

  it('constructs the in-place strategy with its install gate', async () => {
    const installGate = vi.fn(async () => ({ completed: true, reaped: true }))
    const strategy = createUpdateStrategy('win32', { installGate })
    updaterListeners.get('update-available')?.({})
    await strategy.download()

    await strategy.apply()

    expect(installGate).toHaveBeenCalledTimes(1)
    expect(quitAndInstall).toHaveBeenCalledWith(true, true)
  })

  it('forwards update handoff cleanup to the in-place strategy', async () => {
    const releaseInstallHandoff = vi.fn()
    quitAndInstall.mockImplementationOnce(() => {
      throw new Error('installer unavailable')
    })
    const strategy = createUpdateStrategy('win32', {
      installGate: vi.fn(async () => ({ completed: true, reaped: true })),
      releaseInstallHandoff
    })
    updaterListeners.get('update-available')?.({})
    await strategy.download()

    await strategy.apply()

    expect(releaseInstallHandoff).toHaveBeenCalledOnce()
  })

  it('uses ElectronUpdaterStrategy on darwin for a packaged stable build', () => {
    expect(createUpdateStrategy('darwin', { isPackaged: true, version: '1.2.3' })).toBeInstanceOf(
      ElectronUpdaterStrategy
    )
  })

  it('falls back to the installer on darwin for an ad-hoc-signed packaged stable build', () => {
    spawnSync.mockReturnValueOnce({
      status: 0,
      stdout: '',
      stderr: 'Identifier=com.aipoch.medresearch-agent\nSignature=adhoc\nTeamIdentifier=not set\n'
    })

    expect(createUpdateStrategy('darwin', { isPackaged: true, version: '1.2.3' })).toBeInstanceOf(
      UpdateService
    )
  })

  it('falls back to the installer on darwin for a stable build signed by another team', () => {
    spawnSync.mockReturnValueOnce({
      status: 0,
      stdout: '',
      stderr: 'Identifier=com.aipoch.medresearch-agent\nTeamIdentifier=OTHERTEAM1\n'
    })

    expect(createUpdateStrategy('darwin', { isPackaged: true, version: '1.2.3' })).toBeInstanceOf(
      UpdateService
    )
  })

  it('falls back to the installer on darwin for another app signed by the official team', () => {
    spawnSync.mockReturnValueOnce({
      status: 0,
      stdout: '',
      stderr: 'Identifier=com.aipoch.another-app\nTeamIdentifier=87G9WFU9H3\n'
    })

    expect(createUpdateStrategy('darwin', { isPackaged: true, version: '1.2.3' })).toBeInstanceOf(
      UpdateService
    )
  })

  it('falls back to the installer when the installed mac signature cannot be read', () => {
    spawnSync.mockReturnValueOnce({
      status: 1,
      stdout: '',
      stderr: 'code object is not signed at all'
    })

    expect(createUpdateStrategy('darwin', { isPackaged: true, version: '1.2.3' })).toBeInstanceOf(
      UpdateService
    )
  })

  it('falls back to UpdateService on darwin for a nightly (prerelease) build', () => {
    expect(
      createUpdateStrategy('darwin', { isPackaged: true, version: '1.2.3-nightly.abc1234' })
    ).toBeInstanceOf(UpdateService)
  })

  it('falls back to UpdateService on darwin for an unpackaged (dev) build', () => {
    expect(createUpdateStrategy('darwin', { isPackaged: false, version: '1.2.3' })).toBeInstanceOf(
      UpdateService
    )
  })
})
