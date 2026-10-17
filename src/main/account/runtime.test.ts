import { afterEach, expect, it, vi } from 'vitest'

import { configureTestRuntimeMetadata } from '../../../test/runtime-metadata'
import {
  assertAccountChannelAccess,
  configureAccountElectronHost,
  getAccountOwner
} from './runtime'

configureTestRuntimeMetadata()

afterEach(() => {
  vi.unstubAllEnvs()
  configureAccountElectronHost({
    appPath: () => process.cwd(),
    openExternal: async () => undefined
  })
})

const requireLogin = (): void => {
  vi.stubEnv('DRA_PRERELEASE', '')
  vi.stubEnv('DRA_AUTH_MODE', 'required')
  vi.stubEnv('DRA_AUTH_ISSUER', 'https://login.example.com/')
  vi.stubEnv('DRA_AUTH_CLIENT_ID', 'desktop-client')
  configureAccountElectronHost({
    appPath: () => process.cwd(),
    openExternal: async () => undefined
  })
  getAccountOwner()
}

it('probes connectivity while signed out and still closes research commands', () => {
  requireLogin()
  expect(() => assertAccountChannelAccess('network:check-connectivity')).not.toThrow()
  expect(() => assertAccountChannelAccess('network:get-info')).not.toThrow()
  expect(() => assertAccountChannelAccess('account:state')).not.toThrow()
  expect(() => assertAccountChannelAccess('projects:list')).toThrow('DRA account login required.')
  expect(() => assertAccountChannelAccess('settings:get-settings')).toThrow(
    'DRA account login required.'
  )
})
