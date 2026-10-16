import { join } from 'node:path'
import { AccountOwner } from './owner'
import { readAccountConfig } from './config'
import { readDeployedAccountConfig } from './deployment-config'
import { createIdentityBinding } from './identity-binding'
import { resolveConfigRoot } from '../storage-root'
import { membershipFeatureForChannel } from '../../shared/membership'
import { createAccountSessionStore } from './session-store'
import { protectedSafeStorage } from '../secure-storage'

let owner: AccountOwner | undefined
let accountAppPath = (): string => process.cwd()
let openAccountBrowser = (_url: string): Promise<void> => Promise.resolve()

// The Electron shell installs these. The Node backend must not import Electron.
export const configureAccountElectronHost = (host: {
  appPath: () => string
  openExternal: (url: string) => Promise<void>
}): void => {
  accountAppPath = host.appPath
  openAccountBrowser = host.openExternal
  owner = undefined
}

export const getAccountOwner = (): AccountOwner => {
  if (!owner) {
    let config: ReturnType<typeof readAccountConfig>
    let configurationError = false
    try {
      config = readDeployedAccountConfig([
        join(process.resourcesPath, 'dra-auth.json'),
        join(accountAppPath(), 'resources', 'dra-auth.json')
      ])
    } catch {
      configurationError = true
    }
    owner = new AccountOwner({
      config,
      configurationError,
      profile: process.env.DRA_ACTIVE_PROFILE,
      openBrowser: (url) => openAccountBrowser(url),
      bindOwner: createIdentityBinding(resolveConfigRoot()),
      sessionStore: createAccountSessionStore(resolveConfigRoot(), protectedSafeStorage)
    })
  }
  return owner
}

export const isAccountAccessAllowed = (): boolean => {
  const state = getAccountOwner().snapshot()
  return !state.required || Boolean(state.user)
}

export const assertAccountChannelAccess = (channel: string): void => {
  if (
    channel.startsWith('account:') ||
    channel.startsWith('window:') ||
    channel.startsWith('database-startup:') ||
    channel === 'app:get-runtime-versions'
  )
    return
  getAccountOwner().assertAccess()
  const feature = membershipFeatureForChannel(channel)
  if (feature) getAccountOwner().assertFeature(feature)
}
