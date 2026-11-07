import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// The AppContainer host is a checked-in build artifact (`vendor/windows/build.mjs` copies the cargo
// output into `vendor/windows/<arch>/`), while its source lives beside it. #164 happened because the
// source gained a fixed ACL grant plan and a path-bearing diagnostic, but the committed x64 binary was
// never rebuilt: on the acceptance PC the probe failed with `WINDOWS_ACL_ACCESS_DENIED: write command
// ACL` and the message could not even name the folder it had tried. A binary built from the same source
// on the same machine passes with the identical launch specification.
//
// This guard reads the shipped executable and requires the diagnostic that only the current source
// emits, so "changed the source, forgot the rebuild" fails here instead of on a doctor's PC.
const vendorRoot = join(
  __dirname,
  '..',
  '..',
  '..',
  'packages',
  'notebook-network-sandbox',
  'vendor',
  'windows'
)

const hostBinary = (arch: 'x64' | 'arm64'): Buffer =>
  readFileSync(join(vendorRoot, arch, 'notebook-appcontainer-host.exe'))

describe('vendored AppContainer host binary', () => {
  it('ships an x64 host that names the folder when an AppContainer ACL grant fails', () => {
    const binary = hostBinary('x64').toString('utf8')

    // The current source writes `grant AppContainer access to {path}: …`; the stale binary in #164 wrote
    // `grant AppContainer access to: …`, which is why the log could not say which folder was refused.
    expect(binary).toContain('grant AppContainer access to ')
    expect(binary).not.toContain('grant AppContainer access to: ')

    // The stable markers the TS layer classifies on must survive in the shipped executable.
    expect(binary).toContain('WINDOWS_ACL_ACCESS_DENIED')
    expect(binary).toContain('WINDOWS_ACL_TARGET_MISSING')
  })

  // The arm64 executable cannot be rebuilt on an x64 host (no arm64 MSVC linker) and is still the
  // pre-#164 build. It is asserted present so a packaging change cannot drop it silently; rebuilding it
  // is tracked with the release decision for Windows on ARM rather than hidden behind a skipped test.
  it('keeps the arm64 host in the tree while it is rebuilt elsewhere', () => {
    expect(hostBinary('arm64').length).toBeGreaterThan(0)
  })
})
