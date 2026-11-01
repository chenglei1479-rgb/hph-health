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

const namesOf = (text: string): string[] =>
  detectPhi(text)
    .filter((span) => span.category === 'PERSON_NAME')
    .map((span) => span.text)

// Separators that must never split a name, and the markers that must not be masked at all.
describe('unlabeled names in a short record', () => {
  it.each([
    ['ジョン・スミス', 'U+30FB is a name character, not a cell separator'],
    ['山田・佐藤', 'two surnames joined by U+30FB stay one span'],
    ['山田-太郎', 'a hyphenated name is not split'],
    ['山田　太郎', 'a full-width space separates the two parts, it does not split the cell']
  ])('keeps %s in one span (%s)', (text) => {
    expect(namesOf(text)).toEqual([text])
  })

  it('does not mask the field label of a value it masks', () => {
    expect(namesOf('患者氏名：山田 太郎')).toEqual(['山田 太郎'])
    // A variable dictionary whose column is itself named 氏名 must keep that column name.
    expect(namesOf('氏名\t患者データの有無\tbinary\t0=no; 1=yes')).toEqual([])
    expect(namesOf('カルテ番号：123456')).toEqual([])
  })

  it('does not guess inside a cell whose parenthesised slot is a unit or a value', () => {
    for (const text of [
      '年齢（歳）',
      '投与量（mg）',
      '連絡先（03-1234-5678）',
      '同意取得日（yyyy/mm/dd）'
    ]) {
      expect(namesOf(text)).toEqual([])
    }
  })

  it('leaves a name inside a long record to the labelled rules, the same window as before', () => {
    // 80 characters is the documented limit of this branch: past it only labelled rules run.
    const long = `山田太郎 ${'経過観察'.repeat(20)}`
    expect(long.length).toBeGreaterThan(80)
    expect(namesOf(long)).toEqual([])
  })
})
