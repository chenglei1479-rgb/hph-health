/* Prepare the NSIS toolchain the `build/` suite compiles with, for the `Unit tests (build)` job.
 *
 * Why this exists (#192): `build/packaging.test.ts` and the `-WX` preflight-order case skip themselves
 * when electron-builder's NSIS cache is missing, and a fresh CI runner has no cache. A skipped
 * release-blocker guard is exactly how #205's `warning 6000` reached main: every local probe was green
 * because nothing was ever compiled. So the job prepares the toolchain first and fails here if it
 * cannot, which is what makes "no skips" true rather than hoped for.
 *
 * The download is electron-builder's own: same artifact, same checksum, same cache directory
 * (`ELECTRON_BUILDER_CACHE`, else `%LOCALAPPDATA%\electron-builder\Cache`), so the suite finds it
 * through the same lookup its own tests use. A warm cache costs nothing.
 */
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { getMakeNsisPath, getNsisPluginsPath } = require('app-builder-lib/out/toolsets/windows.js')

// '0.0.0' is electron-builder's legacy toolset, the one it still compiles with when the config does not
// pick `toolsets.nsis`. Keep this in step with `electron-builder.yml`, not with whatever is newest.
const NSIS_TOOLSET = '0.0.0'

const compiler = await getMakeNsisPath(NSIS_TOOLSET)
const pluginsRoot = await getNsisPluginsPath(NSIS_TOOLSET)
const plugins = join(pluginsRoot, 'x86-unicode')

const missing = [
  [compiler.path, 'makensis'],
  [join(plugins, 'nsProcess.dll'), 'nsProcess plugin']
].filter(([path]) => !existsSync(path))

console.log(`makensis: ${compiler.path}`)
console.log(`plugins:  ${plugins}`)
if (missing.length > 0) {
  for (const [path, label] of missing) console.error(`missing ${label}: ${path}`)
  process.exit(1)
}
// The suite reads the cache itself rather than this process's result, so prove the two agree.
if (process.env.ELECTRON_BUILDER_CACHE) {
  console.log(`ELECTRON_BUILDER_CACHE: ${process.env.ELECTRON_BUILDER_CACHE}`)
}
console.log('NSIS toolchain ready: the packaging tests will compile instead of skipping.')
