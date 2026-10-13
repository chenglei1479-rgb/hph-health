/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs')
const yaml = require('js-yaml')
const config = yaml.load(fs.readFileSync('electron-builder.yml', 'utf8'))
const update = require('../build/deployment-validation.cjs').readUpdate(process.cwd())
if (update && update.publisherName !== process.env.DRA_SIGNING_PUBLISHER) {
  throw new Error('Update publisher must match the signing certificate publisher.')
}
if (config.win?.forceCodeSigning !== true || config.win?.verifyUpdateCodeSignature !== true) {
  throw new Error('Windows releases must require signing and update signature verification.')
}
if (!process.env.DRA_SIGNING_PUBLISHER?.trim()) {
  throw new Error(
    'Set DRA_SIGNING_PUBLISHER to the exact certificate publisher before building a Windows release.'
  )
}
if (!(
  process.env.WIN_CSC_LINK ||
  process.env.CSC_LINK ||
  config.win?.azureSignOptions ||
  config.win?.signtoolOptions?.certificateSha1 ||
  config.win?.signtoolOptions?.certificateSubjectName ||
  config.win?.signtoolOptions?.certificateFile
)) {
  throw new Error(
    'A Windows code signing certificate or Azure Artifact Signing configuration is required. Unsigned release builds are disabled.'
  )
}
