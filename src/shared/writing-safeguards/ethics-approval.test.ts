import { describe, expect, it } from 'vitest'

import {
  ETHICS_WRITING_REMINDER,
  ethicsWritingReminder,
  normalizeEthicsApprovalNumber
} from './ethics-approval'

describe('ethics approval reminder', () => {
  it('reminds without blocking when the project number is empty', () => {
    expect(ethicsWritingReminder('', 'ja')).toEqual({
      blocking: false,
      show: true,
      message: ETHICS_WRITING_REMINDER
    })
    expect(ethicsWritingReminder('   ', 'ja').show).toBe(true)
    expect(ethicsWritingReminder(undefined, 'ja').blocking).toBe(false)
    expect(ethicsWritingReminder('', 'zh-CN').message).toContain('伦理审查批准号')
    expect(ethicsWritingReminder('', 'zh-Hans').message).toBe(
      ethicsWritingReminder('', 'zh-CN').message
    )
    expect(ethicsWritingReminder('').message).toBe(ethicsWritingReminder('', 'en').message)
    expect(ethicsWritingReminder('', 'pt-BR').message).toBe(ethicsWritingReminder('', 'en').message)
    expect(ethicsWritingReminder('', 'en').message).not.toBe(ETHICS_WRITING_REMINDER)
    expect(ethicsWritingReminder('', 'zh-CN').blocking).toBe(false)
  })

  it('stays quiet once a number is recorded', () => {
    const reminder = ethicsWritingReminder('  2024-医-018  ')
    expect(reminder.show).toBe(false)
    expect(reminder.blocking).toBe(false)
    expect(normalizeEthicsApprovalNumber('2024-医-018\nextra')).toBe('2024-医-018extra')
  })
})
