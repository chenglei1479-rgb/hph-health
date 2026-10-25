import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_NOTEBOOK_NETWORK_SETTINGS } from '../../shared/notebook-network'
import { NotebookNetworkSandboxOwner } from './network-sandbox-owner'
import { WindowsRuntimeComponentStore } from './windows-runtime-components'
import { WindowsRuntimeIncompatibleError } from './windows-runtime-components'

const backend = vi.hoisted(() => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  status: vi.fn().mockResolvedValue({ kind: 'ready', warnings: [] }),
  isWindowsProtectionConfigured: vi.fn().mockResolvedValue(true),
  dispose: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('@aipoch/notebook-network-sandbox', () => ({
  NotebookNetworkSandbox: class {
    status = backend.status
    initialize = backend.initialize
    isWindowsProtectionConfigured = backend.isWindowsProtectionConfigured
    dispose = backend.dispose
  }
}))

const owner = (): NotebookNetworkSandboxOwner =>
  new NotebookNetworkSandboxOwner({
    resourceRoot: tmpdir(),
    windowsRuntimeRoot: join(tmpdir(), 'fixture-windows-runtime'),
    platform: 'win32',
    getSettings: async () => DEFAULT_NOTEBOOK_NETWORK_SETTINGS,
    persistAlwaysAllow: vi.fn(),
    requestDecision: vi.fn()
  })

beforeEach(() => {
  backend.status.mockResolvedValue({ kind: 'ready', warnings: [] })
  backend.isWindowsProtectionConfigured.mockResolvedValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Windows protected execution admission', () => {
  it('advertises the protected binding from configuration without running the runtime probe', async () => {
    // Capability assembly must stay cheap: no component selection (and therefore no probe or ACL
    // grant) happens just because a session is created.
    const select = vi.spyOn(WindowsRuntimeComponentStore.prototype, 'select')
    const sandbox = owner()

    await expect(sandbox.windowsProtectionConfigured()).resolves.toBe(true)

    expect(select).not.toHaveBeenCalled()
    await sandbox.dispose()
  })

  it('still refuses execution when the protected runtime cannot be prepared', async () => {
    const incompatible = new WindowsRuntimeIncompatibleError(
      'Windows runtime is incompatible with protected execution. (WIN-PROTECTED-EXEC-01)'
    )
    vi.spyOn(WindowsRuntimeComponentStore.prototype, 'select').mockRejectedValue(incompatible)
    const sandbox = owner()

    // The delayed check is fail-closed: readiness and execution both reject instead of falling back
    // to unguarded execution, and the rejection carries the same diagnostic number as the UI copy.
    await expect(sandbox.windowsProtectionReady()).rejects.toThrow('WIN-PROTECTED-EXEC-01')
    await expect(sandbox.resolveWindowsRuntime({ runtime: 'repl' })).rejects.toThrow(
      'WIN-PROTECTED-EXEC-01'
    )
    await sandbox.dispose()
  })
})
