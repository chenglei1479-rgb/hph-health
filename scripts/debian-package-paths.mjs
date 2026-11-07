/* #212: the Debian packaging names, derived the way electron-builder derives them.
 *
 * The bundled Linux CLI launcher used to be validated against `/opt/MedResearch-Agent`, a directory the
 * package never creates: production builds the install root from `productName` and the command from
 * `metadata.name`, and the fixtures repeated a literal instead. That is the same failure the #205
 * incident wrote down - a test must reproduce the production shape, not a shape production cannot
 * produce - so both inputs are read here, from the files the build reads, through the same function the
 * build uses.
 *
 * Production references:
 *   - `appBuilderLib/out/appInfo.js` - `sanitizedProductName = sanitizeFileName(productName)`, and
 *     `sanitizedName = sanitizeFileName(name)`.
 *   - `appBuilderLib/out/targets/FpmTarget.js` - the deb install root is `/opt/${sanitizedProductName}`.
 *   - `appBuilderLib/out/linuxPackager.js` - the command is
 *     `executableName ?? appInfo.sanitizedName.toLowerCase()`.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { load } from 'js-yaml'

const require = createRequire(import.meta.url)
const { sanitizeFileName } = require('builder-util/out/filename')

const readConfig = () => load(readFileSync('electron-builder.yml', 'utf8'))
const readPackageJson = () => JSON.parse(readFileSync('package.json', 'utf8'))

const config = readConfig()
const packageJson = readPackageJson()

// `${sanitizedProductName}` in the deb templates: the `/opt/<name>` install root.
export const installRootName = sanitizeFileName(String(config.productName))
// `${executable}` in the deb templates: the `/usr/bin/<name>` command and the alternatives group.
export const commandName = String(
  config.linux?.executableName ?? sanitizeFileName(String(packageJson.name))
).toLowerCase()
// The file name the launcher is shipped under inside `resources/`. The templates register it as the
// alternatives target, and `scripts/deb-cli-launcher.test.ts` pins the value.
export const cliResourceName = String(
  (config.linux?.extraResources ?? []).find(
    (resource) => resource?.from === 'build/deb-cli-launcher'
  )?.to
)
