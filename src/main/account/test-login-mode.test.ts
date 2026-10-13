import { expect, it } from 'vitest'
import { readAccountConfig } from './config'
import { readDeployedAccountConfig } from './deployment-config'

const original = {
  DRA_AUTH_MODE: 'test',
  DRA_AUTH_ISSUER: 'https://dev-s0savnzm2r5rtdvt.us.auth0.com/',
  DRA_AUTH_CLIENT_ID: 'Rh2MZp3aNDrmGLuI3VHsnNI1mG4SPUqf'
}

it('restores normal account login from the shipped test tenant configuration', () => {
  const config = readDeployedAccountConfig(['resources/dra-auth.json'], {})
  expect(config?.issuer).toBe(original.DRA_AUTH_ISSUER)
  expect(config?.clientId).toBe(original.DRA_AUTH_CLIENT_ID)
  expect(config?.connections.google).toBe('google-oauth2')
})

it('keeps local mode optional without reading the shipped login configuration', () => {
  expect(readDeployedAccountConfig(['resources/dra-auth.json'], { DRA_AUTH_MODE: 'local' })).toBeUndefined()
})

it('permits only the pinned original development tenant in explicit test mode', () => {
  expect(readAccountConfig(original)?.issuer).toBe(original.DRA_AUTH_ISSUER)
  expect(() => readAccountConfig({ ...original, DRA_AUTH_MODE: 'required' })).toThrow()
  expect(() => readAccountConfig({ ...original, DRA_AUTH_CLIENT_ID: 'different' })).toThrow()
  expect(() => readAccountConfig({ ...original, DRA_AUTH_ISSUER: 'https://dev-other.auth0.com/' })).toThrow()
})
