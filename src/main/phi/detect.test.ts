import { describe, expect, it } from 'vitest'

import { detectPhi } from './detect'

// The whole-string name fallback previously treated any short Japanese string (and long capitalized
// English prose without digits) as PERSON_NAME, which blocked greetings and tool descriptions.
describe('whole-string name guess', () => {
  it.each([
    ['こんにちは', false],
    ['ありがとうございます', false],
    ['MCP server name. Omit to list resources from every configured server.', false],
    ['山田 太郎', true],
    ['ヤマダ タロウ', true],
    ['Smith, John', true],
    ['患者：山田 太郎', true]
  ])('classifies %s as name guess: %s', (text, expected) => {
    const names = detectPhi(text).filter((span) => span.category === 'PERSON_NAME')
    expect(names.length > 0).toBe(expected)
  })
})
