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

// #170: a group statistic is not a patient age. The rule id is the only signal the gate ever sees, so
// the shape has to be recorded there; the gate and deidentify then treat exactly these ids differently.
describe('aggregate ages carry their own rule id', () => {
  const dateRules = (text: string): Array<string | undefined> =>
    detectPhi(text)
      .filter((span) => span.category === 'DATE')
      .map((span) => span.rule)

  it('records a mean age', () => {
    expect(dateRules('非欠測の平均年齢65歳')).toEqual(['age-aggregate-mean'])
    expect(dateRules('平均年齢は65歳')).toEqual(['age-aggregate-mean'])
  })

  it('records a per-N-years rate denominator', () => {
    expect(dateRules('年齢10歳当たりOR 1.98')).toEqual(['age-ratio-per-years'])
    expect(dateRules('10歳当たりの有病率は1.2%')).toEqual(['age-ratio-per-years'])
  })

  it('records both shapes in one summary', () => {
    expect(dateRules('平均年齢は65歳、年齢10歳当たりOR 1.98')).toEqual([
      'age-aggregate-mean',
      'age-ratio-per-years'
    ])
  })

  // An age that names a person or a cohort member keeps the plain rule and keeps blocking.
  it.each([
    '患者は65歳で糖尿病の既往がある。',
    '65歳、男性。',
    '65歳以上',
    '10歳代',
    '満65歳',
    '年齢65歳'
  ])('keeps a person age on age-sai: %s', (text) => {
    expect(dateRules(text)).toEqual(['age-sai'])
  })
})

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

// #244: a 66-character CJK field of ordinary prose was cut into three consecutive "person names" by
// `guess-segment`, and the screenshot sentence was held as one name by `guess-whole`. A name part is
// short; a clause is not. Reviewed names run from five to eight kanji without a space (西園寺公望,
// 武者小路実篤, 勅使河原剛太朗, 長谷川太郎左衛門), so the bound is eight; the shortest false shape in
// the incident was nine characters (暂时不需要任何信息).
describe('CJK prose is not a name (#244)', () => {
  it.each([
    ['暂时不需要任何信息 仅仅需要看下这个课题的创新性', 'one clause pair with a space'],
    ['暂时不需要任何信息，仅仅需要看下这个课题的创新性', 'two clauses split by a comma'],
    ['暂时不需要任何信息', 'one nine-character clause'],
    ['我想研究一下支气管扩张症患者出院后使用LABA的成本效果分析', 'a research topic']
  ])('releases %s (%s)', (text) => {
    expect(namesOf(text)).toEqual([])
  })

  // Recall floor: the bound must not touch a single reviewed name, including the script mixes that
  // are the reason the shape is not kanji-only. These are the fixture names that sit at the edge.
  it.each([
    '山田 太郎',
    '山田太郎',
    '椎名凛太郎',
    '西園寺公望',
    '武者小路実篤',
    '勅使河原剛太朗',
    '長谷川太郎左衛門',
    '小鳥遊 ゆかり',
    '宮ノ崎ハル',
    'ブリュンヒルデ',
    'タカサゴヤ・タクミ',
    'John Smith',
    'Smith, John'
  ])('still masks the reviewed name %s', (text) => {
    expect(namesOf(text)).toContain(text)
  })
})

// #244: the beta.23 build blocked the agent's own plan line as a person name. The field was 78 characters and
// the span was offset 41 / length 6: 明确研究问题. It is a verb-object clause, not a name, and it
// carries no particle — so a particle veto alone cannot reject it. What it does carry is a research
// noun at its end; a personal name does not end in 问题/数据/计划/流程.
describe('a verb-object clause is not a name (#244)', () => {
  const plan =
    '我将使用 biomedical-discovery 技能整理第一阶段研究计划草稿，明确研究问题、所需证据与数据及待确认事项；本阶段不开展外部检索或数据分析。'

  it('releases the agent plan line #244 reported', () => {
    expect(plan).toHaveLength(78)
    const names = detectPhi(plan).filter((span) => span.category === 'PERSON_NAME')
    expect(names.map((span) => [span.start, span.end, span.text])).toEqual([])
  })

  it.each(['明确研究问题', '所需证据', '研究计划草稿', '这个课题的创新性', '继续', '挨拶'])(
    'releases the clause %s',
    (text) => {
      expect(namesOf(text)).toEqual([])
    }
  )

  // The veto must not cost a reviewed name, including one that contains 和 (a name character).
  it.each(['山田 太郎', '椎名凛太郎', '勅使河原剛太朗', '長谷川太郎左衛門', '鈴森 和子'])(
    'still masks the reviewed name %s',
    (text) => {
      expect(namesOf(text)).toContain(text)
    }
  )
})
