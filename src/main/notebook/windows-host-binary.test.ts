import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const requireBuild = createRequire(import.meta.url)
const hostGuard = requireBuild('../../../build/notebook-host-binary.cjs') as {
  archName: (arch?: number | string | null) => string
  assertHostBinaryCurrent: (options?: { arch?: number | string; root?: string }) => string
  hostBinaryPath: (arch: string, root?: string) => string
}
const beforePack = requireBuild('../../../build/before-pack.cjs') as (context: {
  electronPlatformName: string
  arch?: number
  appOutDir: string
}) => Promise<void>

// The AppContainer host is a checked-in build artifact (`vendor/windows/build.mjs` copies the cargo output
// into `vendor/windows/<arch>/`), while its source lives beside it. #164 happened because the source
// gained a fixed ACL grant plan and a path-bearing diagnostic, but the committed x64 binary was never
// rebuilt: on the acceptance PC the probe failed with `WINDOWS_ACL_ACCESS_DENIED: write command ACL` and
// the message could not even name the folder it had tried. A binary built from the same source on the
// same machine passes with the identical launch specification.
describe('vendored AppContainer host binary', () => {
  it('accepts the shipped x64 host, which names the folder when an ACL grant fails', () => {
    expect(hostGuard.assertHostBinaryCurrent({ arch: 1 })).toBe(
      hostGuard.hostBinaryPath('x64')
    )
  })

  it('maps the electron-builder arch enum onto the vendor directory', () => {
    expect(hostGuard.archName(1)).toBe('x64')
    expect(hostGuard.archName(3)).toBe('arm64')
    expect(hostGuard.archName(undefined)).toBe('x64')
  })

  it('rejects an executable that predates the current source, and one that is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'host-guard-'))
    try {
      const stale = hostGuard.hostBinaryPath('x64', root)
      mkdirSync(join(root, 'packages', 'notebook-network-sandbox', 'vendor', 'windows', 'x64'), {
        recursive: true
      })
      // The pre-#164 diagnostic: no folder name, which is why the beta.21 log could not say what failed.
      writeFileSync(stale, 'grant AppContainer access to: WINDOWS_ACL_ACCESS_DENIED: write command ACL')
      expect(() => hostGuard.assertHostBinaryCurrent({ arch: 1, root })).toThrow(/is stale/u)

      rmSync(stale)
      expect(() => hostGuard.assertHostBinaryCurrent({ arch: 1, root })).toThrow(/is missing/u)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  // CTO's condition for accepting an arm64 executable that is not rebuilt here: packaging it must fail
  // loudly. This test is the tripwire - it goes red the moment the arm64 host is rebuilt, which is when
  // the assertion should be deleted together with the stale binary.
  it('refuses to package arm64 while its executable predates the fix', () => {
    expect(() => hostGuard.assertHostBinaryCurrent({ arch: 3 })).toThrow(/arm64 is stale/u)
  })

  it('runs the guard from the packaging hook before anything is emitted', async () => {
    const payload = mkdtempSync(join(tmpdir(), 'before-pack-payload-'))
    try {
      // The hook must refuse an arm64 Windows build before it measures or writes anything.
      await expect(
        beforePack({ electronPlatformName: 'win32', arch: 3, appOutDir: payload })
      ).rejects.toThrow(/arm64 is stale/u)
      // A non-Windows build never looks at the Windows executable.
      await expect(beforePack({ electronPlatformName: 'linux', appOutDir: payload })).resolves.toBe(
        undefined
      )
    } finally {
      rmSync(payload, { recursive: true, force: true })
    }
  })
})
