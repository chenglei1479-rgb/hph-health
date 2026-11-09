/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Official GitHub artifact URLs used by the Electron installers on GitHub-hosted runners.
export const GITHUB_ELECTRON_MIRROR = 'https://github.com/electron/electron/releases/download/'
export const GITHUB_ELECTRON_BUILDER_BINARIES_MIRROR =
  'https://github.com/electron-userland/electron-builder-binaries/releases/download/'
export const DEFAULT_NPM_CI_ARGS = ['--no-audit']
// One retry on every GitHub Actions runner, not only Windows. The retry used to be Windows-only,
// so the Linux and macOS unit-test jobs got exactly one attempt against the same downloads; when a
// download step fails twice on any runner the install is the thing to fix, not the loop to grow.
export const CI_ATTEMPTS = 2
export const CI_RETRY_DELAY_MS = 5_000
// Historical names, kept because they describe the delay rather than a platform.
export const WINDOWS_CI_ATTEMPTS = CI_ATTEMPTS
export const WINDOWS_CI_RETRY_DELAY_MS = CI_RETRY_DELAY_MS

export function shouldForceGitHubElectronMirrors(env = process.env) {
  return env.GITHUB_ACTIONS === 'true'
}

export function npmCiAttemptCount({ env = process.env } = {}) {
  return env.GITHUB_ACTIONS === 'true' ? CI_ATTEMPTS : 1
}

const defaultSleep = (ms) => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

export function githubElectronMirrorEnv(env = process.env) {
  return {
    ...env,
    ELECTRON_MIRROR: GITHUB_ELECTRON_MIRROR,
    ELECTRON_BUILDER_BINARIES_MIRROR: GITHUB_ELECTRON_BUILDER_BINARIES_MIRROR
  }
}

export function npmCiEnv(env = process.env) {
  return shouldForceGitHubElectronMirrors(env) ? githubElectronMirrorEnv(env) : { ...env }
}

export function npmCiCommand(platform = process.platform) {
  return platform === 'win32' ? 'npm.cmd' : 'npm'
}

export function runNpmCi({
  args = process.argv.slice(2),
  env = process.env,
  platform = process.platform,
  sleep = defaultSleep,
  spawn = spawnSync
} = {}) {
  const attempts = npmCiAttemptCount({ platform, env })
  const command = npmCiCommand(platform)
  const spawnArgs = ['ci', ...DEFAULT_NPM_CI_ARGS, ...args]
  const options = {
    env: npmCiEnv(env),
    stdio: 'inherit',
    shell: platform === 'win32'
  }

  let status = 1
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    // stdio stays 'inherit': the install's output belongs in the job log, and capturing it here
    // would mean forwarding two streams by hand. The cost is that this helper cannot answer "was the
    // second attempt's error the same as the first's" - it only keeps the final exit status. Making
    // that answerable needs a tee of each attempt's tail, which is its own change.
    status = spawn(command, spawnArgs, options).status ?? 1
    if (status === 0) return 0
    if (attempt < attempts) {
      // Stable id so a recovered install is still visible on the run page, and so a search for
      // NPM-CI-RETRY-01 finds every retry this helper has ever made.
      console.error(
        `NPM-CI-RETRY-01 attempt=${attempt + 1}/${attempts} previous-exit=${status} retry-after-ms=${CI_RETRY_DELAY_MS}`
      )
      sleep(CI_RETRY_DELAY_MS)
    }
  }
  console.error(`npm ci failed: process attempts=${attempts} exit=${status}`)
  // Run-page annotation: workflow commands are read from stdout.
  console.log(`::error title=npm ci failed::process attempts=${attempts} exit=${status}`)
  return status
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(runNpmCi())
}
