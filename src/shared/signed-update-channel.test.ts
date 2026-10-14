import { describe, expect, it } from 'vitest'

import {
  DRA_UPDATE_FEED_PLACEHOLDER,
  channelAllowsUpdate,
  isPlaceholderValue,
  isStagedRolloutEligible,
  parseDraSigningConfig,
  parseLatestYml,
  rolloutBucket,
  signatureSatisfiesPolicy,
  UPDATE_SIGNATURE_REJECTED,
  updatesDisabledBySigningConfig,
  type DraSigningConfig
} from './signed-update-channel'

const configured = (): DraSigningConfig => ({
  updateFeedUrl: 'https://updates.dra.example/dra/',
  macTeamId: 'TEAMID1234',
  windowsPublisherName: 'DRA Publisher',
  requireNotarization: true,
  requestedChannel: 'stable'
})

describe('signed update channel', () => {
  it('treats the placeholder feed and publisher as disabled', () => {
    expect(isPlaceholderValue(DRA_UPDATE_FEED_PLACEHOLDER)).toBe(true)
    expect(isPlaceholderValue('https://updates.example.invalid/dra/')).toBe(true)
    expect(
      updatesDisabledBySigningConfig({
        ...configured(),
        updateFeedUrl: DRA_UPDATE_FEED_PLACEHOLDER
      })
    ).toBe(true)
    expect(
      updatesDisabledBySigningConfig({ ...configured(), windowsPublisherName: 'REPLACE_ME' })
    ).toBe(true)
    expect(updatesDisabledBySigningConfig(configured())).toBe(false)
  })

  it('rejects signing documents that carry extra fields or a non-https feed', () => {
    expect(() => parseDraSigningConfig({ ...configured(), clientSecret: 'nope' })).toThrow(
      /invalid/i
    )
    expect(
      updatesDisabledBySigningConfig({
        ...configured(),
        updateFeedUrl: 'http://updates.dra.example/dra/'
      })
    ).toBe(true)
  })

  it('reads channel and staged rollout percent from latest.yml', () => {
    const feed = parseLatestYml(`
version: 1.4.0
files:
  - url: DRA-setup.exe
channel: beta
stagingPercentage: 25
path: DRA-setup.exe
sha512: abc
`)
    expect(feed).toEqual({ version: '1.4.0', channel: 'beta', stagingPercentage: 25 })
    expect(() =>
      parseLatestYml('version: 1.0.0\nchannel: latest\nstagingPercentage: 10\n')
    ).toThrow()
    expect(() =>
      parseLatestYml('version: 1.0.0\nchannel: stable\nstagingPercentage: 101\n')
    ).toThrow()
  })

  it('keeps a stable cohort and withholds partial rollouts without an install id', () => {
    const id = '4f3c2a10-1111-2222-3333-444455556666'
    expect(rolloutBucket(id)).toBe(rolloutBucket(id))
    expect(isStagedRolloutEligible(id, 100)).toBe(true)
    expect(isStagedRolloutEligible(id, 0)).toBe(false)
    expect(isStagedRolloutEligible(undefined, 30)).toBe(false)
    expect(isStagedRolloutEligible(undefined, 100)).toBe(true)
    const bucket = rolloutBucket(id)
    expect(isStagedRolloutEligible(id, bucket)).toBe(false)
    expect(isStagedRolloutEligible(id, bucket + 1)).toBe(true)
  })

  it('offers a feed only on the requested channel', () => {
    expect(channelAllowsUpdate('stable', 'stable')).toBe(true)
    expect(channelAllowsUpdate('beta', 'stable')).toBe(false)
    expect(channelAllowsUpdate('beta', 'beta')).toBe(true)
  })

  it('requires a notarized macOS team id and a pinned Windows publisher before install', () => {
    const config = configured()
    expect(
      signatureSatisfiesPolicy(
        { platform: 'darwin', teamId: 'TEAMID1234', notarized: true },
        config
      )
    ).toEqual({ ok: true })
    expect(
      signatureSatisfiesPolicy(
        { platform: 'darwin', teamId: 'TEAMID1234', notarized: false },
        config
      )
    ).toEqual({ ok: false, reason: UPDATE_SIGNATURE_REJECTED })
    expect(
      signatureSatisfiesPolicy({ platform: 'darwin', teamId: 'OTHER', notarized: true }, config)
    ).toEqual({ ok: false, reason: UPDATE_SIGNATURE_REJECTED })
    expect(
      signatureSatisfiesPolicy(
        {
          platform: 'win32',
          signatureStatus: 'Valid',
          publisherName: 'CN=DRA Publisher, O=DRA Publisher, C=JP'
        },
        config
      )
    ).toEqual({ ok: true })
    expect(
      signatureSatisfiesPolicy(
        { platform: 'win32', signatureStatus: 'Valid', publisherName: 'CN=Other Publisher' },
        config
      )
    ).toEqual({ ok: false, reason: UPDATE_SIGNATURE_REJECTED })
    expect(
      signatureSatisfiesPolicy(
        { platform: 'win32', signatureStatus: 'NotSigned', publisherName: 'DRA Publisher' },
        config
      )
    ).toEqual({ ok: false, reason: UPDATE_SIGNATURE_REJECTED })
    expect(signatureSatisfiesPolicy({ platform: 'linux' }, config)).toEqual({ ok: true })
  })
})
