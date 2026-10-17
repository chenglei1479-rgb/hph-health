import type { DatabaseStartupState } from '../shared/database-startup'

export const DRA_ACCOUNT_LOGIN_REQUIRED_MESSAGE = 'DRA account login required.'

// A signed-out desktop still has to leave the splash. Login is a screen, not a failed startup.
export const isDraAccountLoginRequired = (error: unknown): boolean =>
  error instanceof Error && error.message.includes(DRA_ACCOUNT_LOGIN_REQUIRED_MESSAGE)

// Reuses the existing retryable startup copy so a failed ready-transition cannot spin forever.
export const blockedDesktopStartupState = (): DatabaseStartupState => ({
  phase: 'blocked',
  error: {
    code: 'database_startup_unavailable',
    message: 'DRA could not finish checking its database.',
    retryable: true
  }
})
