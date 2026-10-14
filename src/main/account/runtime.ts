import { app, shell } from 'electron'
import { join } from 'node:path'
import { AccountOwner } from './owner'
import { loadBundledAccountConfig } from './deployment-config'
import { createIdentityBinding } from './identity-binding'
import { resolveConfigRoot } from '../storage-root'
import { membershipFeatureForChannel } from '../../shared/membership'
import { createAccountConsentStore, readAccountConsent, readTermsOfUse } from './consent'
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
    const root = resolveConfigRoot()
    let consent: ReturnType<typeof readAccountConsent> | undefined
    let terms: ReturnType<typeof readTermsOfUse> | undefined
    let consentError = false
    let termsError = false
    if (config) {
      try {
        consent = readAccountConsent([
          join(process.resourcesPath, 'account-consent.json'),
          join(app.getAppPath(), 'resources', 'account-consent.json')
        ])
      } catch {
        consentError = true
      }
      try {
        terms = readTermsOfUse([
          join(process.resourcesPath, 'terms-of-use.json'),
          join(app.getAppPath(), 'resources', 'terms-of-use.json')
        ])
      } catch {
        termsError = true
      }
    }
    owner = new AccountOwner({
      config,
      configurationError,
      consent,
      consentError,
      terms,
      termsError,
      consentStore: createAccountConsentStore(root),
      profile: process.env.DRA_ACTIVE_PROFILE,
      openBrowser: (url) => shell.openExternal(url),
      bindOwner: createIdentityBinding(root),
      sessionStore: createAccountSessionStore(root, protectedSafeStorage)
    })
  }
  return owner
}

export const isAccountAccessAllowed = (): boolean => {
  const state = getAccountOwner().snapshot()
  return (
    !state.required || (Boolean(state.user) && !state.consent?.required && !state.terms?.required)
  )
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
