/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs')
const path = require('node:path')
const yaml = require('js-yaml')
const { transformSync } = require('esbuild')
const { runInNewContext } = require('node:vm')
exports.readUpdate = function readUpdate(projectDir) {
  const source = fs.readFileSync(
    path.join(projectDir, 'src/shared/dra-update-deployment.ts'),
    'utf8'
  )
  const output = transformSync(source, { loader: 'ts', format: 'cjs', platform: 'node' }).code
  const module = { exports: {} }
  runInNewContext(output, { module, exports: module.exports, URL })
  return module.exports.parseDraUpdateDeployment(
    yaml.load(fs.readFileSync(path.join(projectDir, 'resources/dra-update.yml'), 'utf8'))
  )
}
