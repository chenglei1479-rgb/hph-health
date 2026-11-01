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

  it('releases a cell whose every parenthesised slot is a unit', () => {
    for (const text of [
      '年齢（歳）',
      '投与量（mg）',
      '収縮期血圧（mmHg）',
      '同意取得日（yyyy/mm/dd）'
    ]) {
      expect(namesOf(text)).toEqual([])
    }
  })

  // A value slot protects the slot, not the rest of the cell: the part outside the parentheses is
  // judged like any other segment. This is the failure mode that a whole-cell skip would open.
  it('judges the part of a cell that sits outside a value slot', () => {
    expect(namesOf('John Smith (MD)')).toEqual(['John Smith'])
    expect(namesOf('山田 (37)')).toEqual(['山田'])
    // 連絡先 is a reviewed field name, so the label survives while the number is masked.
    expect(namesOf('連絡先（03-1234-5678）')).toEqual([])
  })

  // The 80-character limit is a known miss, not a rule of the product: it is pinned as a fixture
  // record (`known-long-name-unmasked`) and owned by the ticket that extends the window, so the gap
  // is measured by the dev set instead of asserted as intended behaviour here.
  it('keeps a name on its own line inside a longer text', () => {
    expect(namesOf('山田太郎\n65歳')).toEqual(['山田太郎'])
  })
})
