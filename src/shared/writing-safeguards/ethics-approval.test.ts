import { describe, expect, it } from 'vitest'

import {
  ETHICS_WRITING_REMINDER,
  ethicsWritingReminder,
  normalizeEthicsApprovalNumber
} from './ethics-approval'

describe('ethics approval reminder', () => {
  it('reminds without blocking when the project number is empty', () => {
    expect(ethicsWritingReminder('')).toEqual({
      blocking: false,
      show: true,
      message: ETHICS_WRITING_REMINDER
    })
    expect(ethicsWritingReminder('   ').show).toBe(true)
    expect(ethicsWritingReminder(undefined).blocking).toBe(false)
  })

  it('stays quiet once a number is recorded', () => {
    const reminder = ethicsWritingReminder('  2024-医-018  ')
    expect(reminder.show).toBe(false)
    expect(reminder.blocking).toBe(false)
    expect(normalizeEthicsApprovalNumber('2024-医-018\nextra')).toBe('2024-医-018extra')
  })
})
