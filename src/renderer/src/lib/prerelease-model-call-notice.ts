import { isDraPrerelease } from '../../../shared/prerelease'

const STORAGE_KEY = 'dra-prerelease-model-call-acknowledged'

type Listener = () => void

const listeners = new Set<Listener>()
let pending: (() => void) | undefined
let bypass = false

const acknowledged = (): boolean => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export const prereleaseModelCallNoticePending = (): boolean => pending !== undefined

export const subscribePrereleaseModelCallNotice = (listener: Listener): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Returns true when the caller must not start the model call yet.
// `retry` runs after the user continues, and only that one attempt skips the gate.
export const requestPrereleaseModelCallNotice = (retry: () => void): boolean => {
  if (!isDraPrerelease()) return false
  if (bypass) {
    bypass = false
    return false
  }
  if (acknowledged()) return false
  pending = retry
  for (const listener of listeners) listener()
  return true
}

export const confirmPrereleaseModelCallNotice = (): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // The in-memory bypass still lets this attempt through.
  }
  const retry = pending
  pending = undefined
  bypass = true
  retry?.()
}

export const resetPrereleaseModelCallNoticeForTests = (): void => {
  pending = undefined
  bypass = false
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage can be unavailable in non-browser tests.
  }
}
