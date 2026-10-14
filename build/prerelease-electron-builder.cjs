/* Unsigned internal beta packages. No Developer ID, no notarization, no Windows publisher check. */
const fs = require('node:fs')
const path = require('node:path')
const yaml = require('js-yaml')

const root = path.resolve(__dirname, '..')
const config = yaml.load(fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8'))

config.win.forceCodeSigning = false
config.dmg.sign = false
config.mac.notarize = false
config.mac.identity = null
delete config.win.azureSignOptions
delete config.win.signtoolOptions
// The stock hook requires DRA_SIGNING_PUBLISHER. This package is unsigned.
config.afterAllArtifactBuild = undefined
config.publish = null

module.exports = config
