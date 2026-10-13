/* eslint-disable @typescript-eslint/no-require-imports */
const { execFileSync } = require('node:child_process')
const path = require('node:path')

// A release is successful only after Windows validates the actual distributed artifacts.
exports.default = async function verifyWindowsRelease(context) {
  const installers = context.artifactPaths.filter((file) => /-win-.*-setup\.exe$/i.test(file))
  if (installers.length === 0) return []
  if (!process.env.DRA_SIGNING_PUBLISHER) throw new Error('DRA_SIGNING_PUBLISHER is required.')
  for (const installer of installers) {
    const arch = /-win-(x64|arm64|ia32)-setup\.exe$/i.exec(installer)?.[1]
    if (!arch) throw new Error('Unknown Windows release architecture.')
    const unpackedDir = arch === 'x64' ? 'win-unpacked' : `win-${arch}-unpacked`
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path.join(__dirname, 'verify-windows-release.ps1'),
        '-Installer',
        installer,
        '-Launcher',
        path.join(path.dirname(installer), unpackedDir, 'medresearch-agent.exe'),
        '-Publisher',
        process.env.DRA_SIGNING_PUBLISHER
      ],
      { stdio: 'inherit' }
    )
  }
  return []
}
