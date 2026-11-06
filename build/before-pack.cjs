/* electron-builder beforePack hook: measure the staged app directory and emit the NSIS path budget (#163).
 *
 * It runs after the app directory is staged (appOutDir) and before the NSIS script is compiled, which is
 * the only window where the payload's real file layout exists and the installer still does not. A build
 * that skips this step fails: installer-preflight.nsh raises !error when the generated include is missing,
 * so a Windows build without the preflight cannot be produced silently.
 */
const path = require('node:path')

const { emit } = require('./installer-path-budget.cjs')

const beforePack = async (context) => {
  if (context.electronPlatformName !== 'win32') return
  emit({
    payloadDir: context.appOutDir,
    out: path.join(__dirname, 'installer-path-budget.nsh')
  })
}

module.exports = beforePack
module.exports.default = beforePack
