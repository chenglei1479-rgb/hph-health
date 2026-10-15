/* eslint-disable @typescript-eslint/no-require-imports */
/* Unsigned, manually distributed doctor-test builds only. */
const fs = require('node:fs')
const path = require('node:path')
const yaml = require('js-yaml')
const root = path.resolve(__dirname, '..')
const config = yaml.load(fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8'))
config.win.forceCodeSigning = false
config.win.verifyUpdateCodeSignature = true
// This test candidate deliberately has no signing identity or signature release gate.
delete config.win.azureSignOptions
delete config.win.signtoolOptions
config.afterSign = undefined
config.afterAllArtifactBuild = undefined
// Doctor-test packages do not publish an application update feed.
config.afterPack = async (context) => {
  await require('./deployment-pack.cjs').default(context)
}
config.extraMetadata = { ...config.extraMetadata, version: '0.1.33-unified.1' }
config.directories = { ...config.directories, output: '../doctor-test-dist-0.1.33-unified.1' }
module.exports = config
