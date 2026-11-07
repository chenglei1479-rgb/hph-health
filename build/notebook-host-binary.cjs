/* Packaging guard for the vendored Windows AppContainer host (#164).
 *
 * `packages/notebook-network-sandbox/vendor/windows/<arch>/notebook-appcontainer-host.exe` is a
 * checked-in build artifact whose source lives one directory over in `vendor/windows-src`. beta.21
 * shipped an executable built before that source gained its current ACL grant plan and its diagnostic
 * that names the refused folder, and the runtime probe then failed on every Windows PC with
 * WINDOWS_ACL_ACCESS_DENIED while the source in the same tree already passed.
 *
 * `src/main/notebook/windows-host-binary.test.ts` checks the same thing on the committed binary; this
 * module is the packaging-time half, so a build for an architecture whose executable predates the source
 * fails instead of shipping. It runs for every Windows arch, including one that is not released today.
 */
const { readFileSync } = require('node:fs')
const path = require('node:path')

// The current source emits `grant AppContainer access to {path}: ...`; the pre-#164 build emitted
// `grant AppContainer access to: ...`, which could not say which folder's ACL it failed to change.
const REQUIRED_MARKERS = ['grant AppContainer access to ', 'WINDOWS_ACL_ACCESS_DENIED']
const STALE_MARKERS = ['grant AppContainer access to: ']

// electron-builder passes its Arch enum: 1 is x64, 3 is arm64. A missing value means the default x64.
const archName = (arch) => {
  if (arch === undefined || arch === null) return 'x64'
  if (arch === 1) return 'x64'
  if (arch === 3) return 'arm64'
  return typeof arch === 'string' ? arch : String(arch)
}

const hostBinaryPath = (arch, root = path.join(__dirname, '..')) =>
  path.join(
    root,
    'packages',
    'notebook-network-sandbox',
    'vendor',
    'windows',
    arch,
    'notebook-appcontainer-host.exe'
  )

/** Throws unless the executable for `arch` was built from the source in this tree. */
const assertHostBinaryCurrent = ({ arch, root } = {}) => {
  const name = archName(arch)
  const file = hostBinaryPath(name, root)
  let bytes
  try {
    bytes = readFileSync(file)
  } catch (error) {
    throw new Error(`Notebook AppContainer host is missing for ${name}: ${file}`, { cause: error })
  }
  const text = bytes.toString('utf8')
  const missing = REQUIRED_MARKERS.filter((marker) => !text.includes(marker))
  const stale = STALE_MARKERS.filter((marker) => text.includes(marker))
  if (missing.length > 0 || stale.length > 0) {
    throw new Error(
      `Notebook AppContainer host for ${name} is stale: the executable does not match its source ` +
        `(missing ${JSON.stringify(missing)}, stale ${JSON.stringify(stale)}). Rebuild it with ` +
        `"node packages/notebook-network-sandbox/vendor/windows/build.mjs ${name}" before packaging.`
    )
  }
  return file
}

module.exports = {
  REQUIRED_MARKERS,
  STALE_MARKERS,
  archName,
  assertHostBinaryCurrent,
  hostBinaryPath
}
