import { readFileSync } from 'node:fs'

import { expect, it } from 'vitest'

import { DRA_UPDATE_FEED_PLACEHOLDER } from '../src/shared/signed-update-channel'

const REQUIRED_SECRETS = [
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'APPLE_ID',
  'APPLE_APP_SPECIFIC_PASSWORD',
  'APPLE_TEAM_ID',
  'WIN_CSC_LINK',
  'WIN_CSC_KEY_PASSWORD',
  'DRA_SIGNING_PUBLISHER'
]

it('reads signing secrets from the CI environment and does not store secret values', () => {
  const workflow = readFileSync('.github/workflows/dra-update-signing.yml', 'utf8')
  const docs = readFileSync('docs/dra-signed-updates.md', 'utf8')
  const signing = readFileSync('resources/dra-signing.yml', 'utf8')

  expect(workflow).toContain('workflow_dispatch')
  expect(workflow).not.toContain('pull_request')
  for (const name of REQUIRED_SECRETS) {
    expect(workflow).toContain(`secrets.${name}`)
    expect(docs).toContain(`\`${name}\``)
  }
  expect(workflow).not.toMatch(/BEGIN (CERTIFICATE|PRIVATE KEY)/)
  expect(signing).toContain(DRA_UPDATE_FEED_PLACEHOLDER)
  expect(signing).toContain('REPLACE_ME')
  expect(docs).toContain('autoInstallOnAppQuit')
  expect(docs).toContain('stagingPercentage')
})
