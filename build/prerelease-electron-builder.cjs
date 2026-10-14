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

// Offline schema-notebook Python. The unsigned beta workflow stages one
// arch under resources/schema-notebook-python before this config is loaded.
// Keep it out of app.asar; a binary cannot be spawned from inside the archive.
// Signed pilot builds keep electron-builder.yml and do not pick this up.
config.files = [...(config.files ?? []), '!resources/schema-notebook-python{,/**/*}']
config.extraResources = [
  ...(config.extraResources ?? []),
  {
    from: 'resources/schema-notebook-python',
    to: 'schema-notebook-python'
  }
]

module.exports = config
