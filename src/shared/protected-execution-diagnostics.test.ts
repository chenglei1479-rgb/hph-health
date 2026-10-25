import { describe, expect, it } from 'vitest'

import {
  isProtectedExecutionUnavailableMessage,
  PROTECTED_EXECUTION_UNAVAILABLE_CODE
} from './protected-execution-diagnostics'

describe('protected execution diagnostics', () => {
  it('classifies the probe wrapper and the native ACL failure', () => {
    expect(
      isProtectedExecutionUnavailableMessage(
        'Windows runtime is incompatible with protected execution.'
      )
    ).toBe(true)
    expect(
      isProtectedExecutionUnavailableMessage(
        'grant AppContainer access to C:\\runtime: WINDOWS_ACL_ACCESS_DENIED: write command ACL'
      )
    ).toBe(true)
    expect(
      isProtectedExecutionUnavailableMessage(
        'ApplicationCommandError: Windows runtime is incompatible with protected execution.'
      )
    ).toBe(true)
  })

  it('leaves unrelated failures alone', () => {
    expect(isProtectedExecutionUnavailableMessage('Notebook kernel exited unexpectedly.')).toBe(
      false
    )
    expect(isProtectedExecutionUnavailableMessage('')).toBe(false)
    expect(isProtectedExecutionUnavailableMessage('Prepare protected mode in Settings.')).toBe(
      false
    )
  })

  it('pins the stable diagnostic number', () => {
    expect(PROTECTED_EXECUTION_UNAVAILABLE_CODE).toBe('WIN-PROTECTED-EXEC-01')
  })
})
