const path = require('node:path')
const { spawnSync } = require('node:child_process')
const env = { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' }
for (const key of ['CSC_LINK', 'WIN_CSC_LINK', 'CSC_KEY_PASSWORD', 'WIN_CSC_KEY_PASSWORD', 'DRA_SIGNING_PUBLISHER']) delete env[key]
const result = spawnSync(process.execPath, [path.resolve('node_modules/electron-builder/cli.js'), '--win', '--config', 'build/doctor-test-config.cjs', '--publish', 'never'], { env, stdio: 'inherit' })
if (result.error) throw result.error
process.exit(result.status ?? 1)
