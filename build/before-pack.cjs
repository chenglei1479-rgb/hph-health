/* electron-builder beforePack hook: verify the Windows payload before it is packaged.
 *
 * Two things happen here, both because a Windows build must not be produced quietly without them:
 *
 * - The AppContainer host is a checked-in artifact. Its executable is asserted to come from the source in
 *   this tree for the arch being packaged (build/notebook-host-binary.cjs); a stale binary is what made
 *   every protected-execution probe fail in beta.21 (#164).
 * - The staged app directory is measured to emit the NSIS path budget (#163). It runs after the app
 *   directory is staged (appOutDir) and before the NSIS script is compiled, which is the only window where
 *   the payload's real file layout exists and the installer still does not. A build that skips this step
 *   fails: installer-preflight.nsh raises !error when the generated include is missing.
 */
const path = require('node:path')

const { emit } = require('./installer-path-budget.cjs')
const { assertHostBinaryCurrent } = require('./notebook-host-binary.cjs')

const beforePack = async (context) => {
  if (context.electronPlatformName !== 'win32') return
  assertHostBinaryCurrent({ arch: context.arch })
  emit({
    payloadDir: context.appOutDir,
    out: path.join(__dirname, 'installer-path-budget.nsh')
  })
}

module.exports = beforePack
module.exports.default = beforePack
