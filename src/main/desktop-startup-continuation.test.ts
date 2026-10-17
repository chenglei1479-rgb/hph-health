import { ApplicationCommandError } from '../shared/application-command-contract'
import { expect, it } from 'vitest'

import {
  blockedDesktopStartupState,
  isDraAccountLoginRequired
} from './desktop-startup-continuation'

it('recognizes the account gate without treating other command failures as sign-in', () => {
  expect(isDraAccountLoginRequired(new Error('DRA account login required.'))).toBe(true)
  expect(
    isDraAccountLoginRequired(
      new ApplicationCommandError('command-failed', 'DRA account login required.')
    )
  ).toBe(true)
  expect(isDraAccountLoginRequired(new Error('database is locked'))).toBe(false)
  expect(isDraAccountLoginRequired('DRA account login required.')).toBe(false)
})

it('publishes a retryable startup block instead of leaving the splash on starting', () => {
  expect(blockedDesktopStartupState()).toEqual({
    phase: 'blocked',
    error: {
      code: 'database_startup_unavailable',
      message: 'DRA could not finish checking its database.',
      retryable: true
    }
  })
})
