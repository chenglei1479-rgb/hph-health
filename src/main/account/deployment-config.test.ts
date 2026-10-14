import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it } from 'vitest'
import { loadBundledAccountConfig, readDeployedAccountConfig } from './deployment-config'
const roots: string[] = []
const fixture = (value: string): string => {
  const root = mkdtempSync(join(tmpdir(), 'dra-public-auth-'))
  roots.push(root)
  const file = join(root, 'dra-auth.json')
  writeFileSync(file, value)
  return file
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
it('ignores a deployed Auth0 tenant and environment overrides on a prerelease build', () => {
  const file = fixture(
    JSON.stringify({
      mode: 'required',
      issuer: 'https://tenant.auth0.com/',
      clientId: 'public-client'
    })
  )
  expect(
    readDeployedAccountConfig([file], {
      DRA_PRERELEASE: '1',
      DRA_AUTH_ISSUER: 'https://tenant.auth0.com/',
      DRA_AUTH_CLIENT_ID: 'override'
    })
  ).toBeUndefined()
  expect(
    readDeployedAccountConfig(
      [file],
      {
        DRA_PRERELEASE: '1',
        DRA_AUTH_MODE: 'local',
        DRA_AUTH_ISSUER: 'https://tenant.auth0.com/',
        DRA_AUTH_CLIENT_ID: 'override'
      },
      { packaged: true }
    )
  ).toBeUndefined()
})
it('loads explicit local mode without a tenant and refuses mixed or development configuration', () => {
  expect(readDeployedAccountConfig([fixture('{"mode":"local"}')], {})).toBeUndefined()
  expect(() =>
    readDeployedAccountConfig([fixture('{"mode":"local","clientId":"id"}')], {})
  ).toThrow()
  expect(() =>
    readDeployedAccountConfig(
      [fixture('{"mode":"required","issuer":"https://dev-test.us.auth0.com/","clientId":"id"}')],
      {}
    )
  ).toThrow()
})
it('loads production organization, API audience and institution connection', () => {
  const file = fixture(
    JSON.stringify({
      mode: 'required',
      issuer: 'https://hospital.auth0.com/',
      clientId: 'native-client',
      audience: 'https://api.hospital.example',
      organization: 'org_hospital',
      connections: { institution: 'hospital-saml' }
    })
  )
  expect(readDeployedAccountConfig([file], {})).toMatchObject({
    organization: 'org_hospital',
    audience: 'https://api.hospital.example',
    connections: { institution: 'hospital-saml' }
  })
})
it('loads public installer configuration without environment variables', () => {
  const file = fixture(
    JSON.stringify({
      issuer: 'https://tenant.auth0.com/',
      clientId: 'public-client',
      connections: { google: 'google-oauth2' }
    })
  )
  expect(readDeployedAccountConfig([file], {})).toMatchObject({
    clientId: 'public-client',
    port: 49174,
    connections: { google: 'google-oauth2' }
  })
})
it('fails closed for malformed, partial, or secret-bearing deployment files', () => {
  for (const content of [
    '{',
    '{}',
    JSON.stringify({
      issuer: 'https://tenant.auth0.com/',
      clientId: 'id',
      clientSecret: 'forbidden'
    }),
    JSON.stringify({ issuer: 'http://tenant.auth0.com/', clientId: 'id' })
  ])
    expect(() => readDeployedAccountConfig([fixture(content)], {})).toThrow()
})
it('only skips absent files and gives explicit environment configuration precedence in dev builds', () => {
  const file = fixture('{}')
  expect(() => readDeployedAccountConfig([file + '.missing'], {})).toThrow(/missing/)
  expect(
    readDeployedAccountConfig([file], {
      DRA_AUTH_ISSUER: 'https://override.auth0.com/',
      DRA_AUTH_CLIENT_ID: 'override'
    })?.clientId
  ).toBe('override')
  expect(() => readDeployedAccountConfig([file], { DRA_AUTH_CLIENT_ID: 'partial' })).toThrow()
})
it('fails closed when dra-auth.json is deleted instead of opening local mode', () => {
  expect(() => readDeployedAccountConfig(['/tmp/dra-auth-missing.json'], {})).toThrow(/missing/)
  expect(
    loadBundledAccountConfig(['/tmp/dra-auth-missing.json'], { DRA_AUTH_MODE: 'local' }, {})
  ).toEqual({ config: undefined, configurationError: false })
  expect(
    loadBundledAccountConfig(
      ['/tmp/dra-auth-missing.json'],
      { DRA_AUTH_MODE: 'local', DRA_AUTH_ISSUER: 'https://evil.example/', DRA_AUTH_CLIENT_ID: 'x' },
      { packaged: true }
    )
  ).toEqual({ configurationError: true })
})
it('ignores DRA_AUTH_* overrides in packaged builds', () => {
  const file = fixture(
    JSON.stringify({
      mode: 'required',
      issuer: 'https://hospital.auth0.com/',
      clientId: 'native-client'
    })
  )
  expect(
    readDeployedAccountConfig(
      [file],
      { DRA_AUTH_ISSUER: 'https://override.auth0.com/', DRA_AUTH_CLIENT_ID: 'override' },
      { packaged: true }
    )?.clientId
  ).toBe('native-client')
  expect(
    readDeployedAccountConfig([file], { DRA_AUTH_MODE: 'local' }, { packaged: true })?.clientId
  ).toBe('native-client')
  expect(() =>
    readDeployedAccountConfig([fixture('{"mode":"local"}')], {}, { packaged: true })
  ).toThrow(/local mode/)
})
