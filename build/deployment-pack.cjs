/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs')
const path = require('node:path')

exports.default = async function deploymentPack(context) {
  await require('./adhoc-sign.cjs').default(context)
  if (context.electronPlatformName !== 'win32') return
  // #163: measure the Windows payload for the NSIS target-folder preflight. It has to run here, after
  // extraResources (the staged Python runtime) are copied into appOutDir and before NSIS is compiled.
  await require('./before-pack.cjs')(context)
  const source = path.join(context.packager.projectDir, 'resources/dra-update.yml')
  const config = require('./deployment-validation.cjs').readUpdate(context.packager.projectDir)
  // `enabled: false` is not a provider feed. Copying it would leave electron-updater
  // with an app-update.yml that has no provider. The app treats that file as disabled
  // when it is present, and does not install one for the stock beta config.
  if (!config || config.enabled === false) return
  if (config.publisherName !== process.env.DRA_SIGNING_PUBLISHER)
    throw new Error('Update publisher must match the release signing publisher.')
  fs.copyFileSync(source, path.join(context.appOutDir, 'resources/app-update.yml'))
}
