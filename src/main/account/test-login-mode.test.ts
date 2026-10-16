import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { readAccountConfig } from './config'
import { loadBundledAccountConfig, readDeployedAccountConfig } from './deployment-config'

const original = {
  DRA_AUTH_MODE: 'test',
  DRA_AUTH_ISSUER: 'https://dev-s0savnzm2r5rtdvt.us.auth0.com/',
  DRA_AUTH_CLIENT_ID: 'Rh2MZp3aNDrmGLuI3VHsnNI1mG4SPUqf'
}

it('ships a production placeholder and does not load the bundled development tenant', () => {
  const text = readFileSync('resources/dra-auth.json', 'utf8')
  expect(text).toContain('REPLACE_WITH_PRODUCTION_TENANT')
  expect(text).toContain('REPLACE_WITH_NATIVE_APPLICATION_CLIENT_ID')
  expect(text).not.toContain('dev-s0savnzm2r5rtdvt')
  expect(text).not.toContain(original.DRA_AUTH_CLIENT_ID)
  expect(() => readDeployedAccountConfig(['resources/dra-auth.json'], {})).toThrow(
    /Replace production/
  )
  expect(loadBundledAccountConfig(['resources/dra-auth.json'], {}, { packaged: true })).toEqual({
    configurationError: true
  })
})

it('keeps local mode optional for unpackaged builds without reading the shipped placeholder', () => {
  expect(
    readDeployedAccountConfig(['resources/dra-auth.json'], { DRA_AUTH_MODE: 'local' })
  ).toBeUndefined()
  expect(() =>
    readDeployedAccountConfig(
      ['resources/dra-auth.json'],
      { DRA_AUTH_MODE: 'local' },
      { packaged: true }
    )
  ).toThrow(/Replace production/)
})

it('permits only the pinned original development tenant in explicit test mode', () => {
  expect(readAccountConfig(original)?.issuer).toBe(original.DRA_AUTH_ISSUER)
  expect(() => readAccountConfig({ ...original, DRA_AUTH_MODE: 'required' })).toThrow()
  expect(() => readAccountConfig({ ...original, DRA_AUTH_CLIENT_ID: 'different' })).toThrow()
  expect(() =>
    readAccountConfig({ ...original, DRA_AUTH_ISSUER: 'https://dev-other.auth0.com/' })
  ).toThrow()
})
