import {
  buildUsageStatisticsPayload,
  type UsageStatisticsPayload
} from '../../../../shared/usage-statistics'

export const USAGE_OPT_IN_STORAGE_KEY = 'dra-usage-statistics-opt-in'
export const USAGE_INSTALL_ID_STORAGE_KEY = 'dra-usage-install-id'

const INSTALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const readUsageOptIn = (): boolean => {
  try {
    return localStorage.getItem(USAGE_OPT_IN_STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

export const writeUsageOptIn = (optIn: boolean): void => {
  try {
    localStorage.setItem(USAGE_OPT_IN_STORAGE_KEY, optIn ? 'on' : 'off')
  } catch {
    // The choice still applies for this session when storage is unavailable.
  }
}

export const readOrCreateUsageInstallId = (): string => {
  try {
    const current = localStorage.getItem(USAGE_INSTALL_ID_STORAGE_KEY)
    if (current && INSTALL_ID.test(current)) return current.toLowerCase()
  } catch {
    // Fall through and mint a new id for this session.
  }
  return resetUsageInstallId()
}

export const resetUsageInstallId = (): string => {
  const next = crypto.randomUUID()
  try {
    localStorage.setItem(USAGE_INSTALL_ID_STORAGE_KEY, next)
  } catch {
    // The new id still applies until the page reloads.
  }
  return next
}

export const previewUsageStatisticsPayload = (
  installId: string,
  appVersion: string,
  os: string
): UsageStatisticsPayload => buildUsageStatisticsPayload({ installId, appVersion, os, events: [] })
