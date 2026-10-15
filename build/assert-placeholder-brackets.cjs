/* eslint-disable @typescript-eslint/no-require-imports */
// electron-builder beforePack: a packaged build must not ship a legal notice while
// fill-in brackets remain. Dev and test runs do not execute this hook.
// DRA_PRERELEASE=1 still checks the privacy notice. It skips only consent and terms
// files, which the beta build does not show because login is off.
const fs = require('node:fs')
const path = require('node:path')

const PLACEHOLDER_BRACKETS = ['【', '】']

// Always required. Deleting the file must not skip the release check.
const REQUIRED_NOTICE_FILES = ['docs/privacy/usage-notice.ja.md']

// Shown only when account login is on. Unused on a prerelease build.
const CONSENT_AND_TERMS_FILES = ['resources/account-consent.json', 'resources/terms-of-use.json']

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function isPrerelease(env) {
  return env.DRA_PRERELEASE === '1'
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function noticeFiles(projectDir, env = process.env) {
  const missing = REQUIRED_NOTICE_FILES.filter(
    (relative) => !fs.existsSync(path.join(projectDir, relative))
  )
  if (missing.length > 0) {
    throw new Error('Packaged release builds require ' + missing.join(' or ') + '.')
  }
  const consent = isPrerelease(env)
    ? []
    : CONSENT_AND_TERMS_FILES.filter((relative) => fs.existsSync(path.join(projectDir, relative)))
  return [...REQUIRED_NOTICE_FILES, ...consent]
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function assertPlaceholderBracketsAbsent(projectDir, relativeFiles, env = process.env) {
  const files = relativeFiles ?? noticeFiles(projectDir, env)
  const unfinished = files.filter((relative) => {
    const text = fs.readFileSync(path.join(projectDir, relative), 'utf8')
    return PLACEHOLDER_BRACKETS.some((bracket) => text.includes(bracket))
  })
  if (unfinished.length > 0) {
    throw new Error(
      'Packaged release builds cannot ship ' +
        unfinished.join(' or ') +
        ' while it still contains 【 or 】. ' +
        'Replace the placeholders and remove those brackets.'
    )
  }
}

/** @param {import('electron-builder').BeforePackContext} context */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function beforePack(context) {
  const { spawnSync } = require('node:child_process')
  const generated = spawnSync(
    process.execPath,
    [path.join(context.packager.projectDir, 'scripts', 'generate-third-party-notices.mjs')],
    { cwd: context.packager.projectDir, stdio: 'inherit' }
  )
  if (generated.status !== 0) {
    throw new Error('Failed to generate THIRD_PARTY_NOTICES.txt before packaging.')
  }
  assertPlaceholderBracketsAbsent(context.packager.projectDir)
}

module.exports = beforePack
module.exports.default = beforePack
module.exports.assertPlaceholderBracketsAbsent = assertPlaceholderBracketsAbsent
module.exports.noticeFiles = noticeFiles
