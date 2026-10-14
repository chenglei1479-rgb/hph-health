import { app, shell } from 'electron'
import { join } from 'node:path'
import { AccountOwner } from './owner'
import { loadBundledAccountConfig } from './deployment-config'
import { createIdentityBinding } from './identity-binding'
import { resolveConfigRoot } from '../storage-root'
import { membershipFeatureForChannel } from '../../shared/membership'
import { createAccountSessionStore } from './session-store'
import { protectedSafeStorage } from '../secure-storage'

let owner: AccountOwner | undefined
export const getAccountOwner = (): AccountOwner => {
  if (!owner) {
    const loaded = loadBundledAccountConfig(
      [
        join(process.resourcesPath, 'dra-auth.json'),
        join(app.getAppPath(), 'resources', 'dra-auth.json')
      ],
      process.env,
      { packaged: app.isPackaged }
    )
    const config = loaded.config
    const configurationError = loaded.configurationError
    owner = new AccountOwner({
      config,
      configurationError,
      profile: process.env.DRA_ACTIVE_PROFILE,
      openBrowser: (url) => shell.openExternal(url),
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
