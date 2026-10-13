/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs')
const path = require('node:path')

exports.default = async function deploymentPack(context) {
  await require('./adhoc-sign.cjs').default(context)
  if (context.electronPlatformName !== 'win32') return
  const source = path.join(context.packager.projectDir, 'resources/dra-update.yml')
  const config = require('./deployment-validation.cjs').readUpdate(context.packager.projectDir)
  if (!config) return
  if (config.publisherName !== process.env.DRA_SIGNING_PUBLISHER)
    throw new Error('Update publisher must match the release signing publisher.')
  fs.copyFileSync(source, path.join(context.appOutDir, 'resources/app-update.yml'))
}
