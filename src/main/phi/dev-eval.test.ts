import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { deidentify } from './deidentify'
import { detectPhi } from './detect'
import { scoreFixture } from './score'
import { createMemoryPhiVault } from './store'

const FIXTURE = join(__dirname, '../../../test/fixtures/jp-phi-testset')
const SHORT_FIXTURE = join(__dirname, '../../../test/fixtures/jp-phi-short-records')

// The baseline pinned by #95, kept as the hard ceiling for every later detector change: a record may
// leave this set, never enter it. A new false positive has to fail here, not in review.
const BASELINE_FLAGGED = [
  'var-reported-tsv.txt',
  'var-age-unit.txt',
  'var-sex-categorical.txt',
  'var-sbp.txt',
  'var-smoking.txt',
  'var-endpoint.txt',
  'var-facility.txt',
  'var-consent-date.txt',
  'var-drug.txt',
  'var-dose.txt',
  'var-ward.txt',
  'var-long-definition.txt',
  'label-age-only.txt',
  'label-sex-only.txt',
  'term-chi-square.txt',
  'term-double-blind.txt',
  'term-colorectal-screening.txt',
  'term-postop-complication.txt',
  'term-lung-cancer-study.txt',
  'known-lung-cancer.txt',
  'known-internal-medicine.txt',
  'known-male.txt',
  'known-levofloxacin.txt',
  'known-survival-rate.txt',
  'known-chemotherapy.txt'
]
// Every removal above is one reviewed vocabulary entry in ordinary-label.ts:
//   var-sex-categorical, label-sex-only  <- 性別
//   var-smoking                          <- 喫煙歴
//   var-facility                         <- 施設名
//   var-drug                             <- 薬剤名 + 一般名
//   var-ward                             <- 病棟
//   var-endpoint                         <- 主要評価項目
//   term-chi-square                      <- 統計学的有意差
//   term-double-blind                    <- 二重盲検比較試験
// The rest are cleared by structure, not by a list: tab cells, punctuation segments, and unit slots.
// The six known limitations are the reviewed-vocabulary set too; レボフロキサシン is the one entry
// still missing, so it stays pinned until someone adds it with a reason.
const PINNED_FLAGGED = ['known-hex-leading-zero.txt', 'known-levofloxacin.txt']

type ShortReport = {
  records: number
  covered: boolean
  nameGold: number
  nameOverlapRecall: number
  nameExactRecall: number
  nameMisses: Array<{ record: string; text: string }>
  mustCleanDecoys: number
  mustCleanFlagged: number
  mustCleanRate: number
  knownDecoys: number
  knownFlagged: number
  flagged: Array<{ record: string; text: string }>
  mixed: { gold: number; detected: number; redacted: number; records: string[] }
}

describe('Japanese PHI dev set', () => {
  it('meets the published dev thresholds and prints the score table', () => {
    process.env.EVAL_DATE = '2026-10-13'
    const report = scoreFixture(FIXTURE)
    const serialized = JSON.stringify(report, null, 2)
    if (process.env.PHI_EVAL_REPORT) writeFileSync(process.env.PHI_EVAL_REPORT, serialized)
    process.stderr.write(`${serialized}\n`)
    expect(report.ok).toBe(true)
    // The aggregate set must never be read as coverage of the short-record branch. If this flips to
    // true, someone added short records to the main set and the separate numbers below stop being
    // independent.
    expect((report.shortRecords as { records: number }).records).toBe(0)
  })

  it('scores the short-record subset on its own', () => {
    process.env.EVAL_DATE = '2026-10-13'
    const report = scoreFixture(SHORT_FIXTURE)
    const short = report.shortRecords as ShortReport
    process.stderr.write(`${JSON.stringify(short, null, 2)}\n`)

    expect(short.covered).toBe(true)
    // `ok` is deliberately NOT asserted for this fixture. It is false by design: the set pins the
    // #103 miss (`known-long-name-unmasked`, 1 of 14 names), so `patientOverlapRecall` and
    // `hardRecall` cannot reach their thresholds, and the set has no age/drug decoys (their rates are
    // 0/0, issue #118). Asserting `ok` here would turn main red for a fixture that is supposed to carry a
    // documented miss. The main fixture's `ok` is asserted above; these are the thresholds that must
    // hold here.
    expect(report.thresholds).toMatchObject({
      patientExactRecall: true,
      decoyRate: true,
      entityHardMisses: true,
      calendarShift: true
    })
    expect(short.records).toBe(53)
    // Recall is the hard line: every name is found, and found exactly. The three name-with-* records
    // are the ones the old whole-string guess dropped whenever another span was present.
    expect(short.nameGold).toBe(14)
    expect(short.nameOverlapRecall).toBe(1)
    expect(short.nameExactRecall).toBe(1)
    expect(short.nameMisses).toEqual([])
    // False positives: the variable-dictionary and term rows are now clean, and the two hexadecimal
    // tool records stay released. A rise here is a regression in a rule, not a threshold to adjust.
    expect(short.mustCleanDecoys).toBe(25)
    expect(short.mustCleanRate).toBe(0)
    // Monotonic decrease, executable, in two layers:
    //   1. the exact flagged set is pinned below, so a record entering or leaving fails either way;
    //   2. a must-clean record may never (re)enter it: the #95 baseline is that group's hard ceiling.
    // `known-*` records are flagged by definition and are pinned by the exact set, so they are not
    // measured against the must-clean ceiling.
    expect(
      short.flagged.filter(
        (item) => !item.record.startsWith('known-') && !BASELINE_FLAGGED.includes(item.record)
      )
    ).toEqual([])
    // The full flagged set is asserted, not its size: one record leaving and another entering would
    // keep the counts equal and slip past a numeric check.
    expect(short.flagged.map((item) => item.record).sort()).toEqual(PINNED_FLAGGED)
    expect(short.knownFlagged).toBe(PINNED_FLAGGED.length)
    // Records carrying another PHI span: the labelled detectors still run there while the row stays
    // readable.
    expect(short.mixed).toEqual({
      gold: 3,
      detected: 3,
      redacted: 3,
      records: [
        'mixed-date-alongside.txt',
        'mixed-karte-alongside.txt',
        'mixed-phone-alongside.txt'
      ]
    })
  })

  // #131: a writing request drew an age-stratified chart, and its four band labels were blocked as
  // dates twelve times. A band names a group of people; `Age 72` names one person. Releasing the
  // band is not a loosened rule — it is the difference between a stratum and an identifier — and
  // every range/open-end spelling is pinned so the next author cannot reintroduce it on one
  // character. The single-age cases below are the recall side of the same pair.
  it.each([
    ['Age 18-39', 'hyphen'],
    ['Age 40–64', 'en dash'],
    ['Age 45—59', 'em dash'],
    ['Age 65~79', 'tilde'],
    ['Age 65〜79', 'wave dash'],
    ['Age 65～79', 'fullwidth tilde'],
    ['Age 80+', 'open end'],
    ['Age 18 to 39', 'spelled range'],
    // The open end has a word form too, and the phrase is the same one chart authors already use.
    // Only pinning the symbol form let the incident come straight back on wording (#131).
    ['Age 80 and over', 'words, and over'],
    ['Age 80 and above', 'words, and above'],
    ['Age 80 or older', 'words, or older'],
    ['Age 80 or over', 'words, or over'],
    ['Age 80 years and over', 'words, years and over'],
    ['Age 80 and older', 'words, and older'],
    ['Age 80 plus', 'words, plus'],
    // The word form is a band only when it ends the label. A quote, a line break or the end of the
    // text is a boundary; a following word is not.
    ['Age 80 and over"', 'words, then a quote'],
    ['Age 80 and over\nAdmitted from the ward', 'words, then a line break'],
    ['Age 80 plus\n', 'words, plus, then a line break']
  ])('does not treat the age band %s (%s) as a date', (text) => {
    expect(detectPhi(text).filter((span) => span.category === 'DATE')).toEqual([])
  })

  it.each([
    ['Age 72', 'Age 72'],
    ['Age 72歳', '72歳'],
    ['18歳', '18歳'],
    ['72才', '72才'],
    ['Age 90', 'Age 90'],
    // The negative lookahead must not be fooled by what merely follows in the sentence: a dose or
    // a sex next to a single age is not a range, so that age is still one person's.
    ['Age 72 5mg', 'Age 72'],
    ['Age 72 — male', 'Age 72'],
    // ...and neither is a word that merely starts with a band word. Telegraphese like "Age 72 plus
    // comorbidities" describes one patient; releasing it would be a missed mask, not a saved
    // keystroke, so the word form has to end the label to count (#131).
    ['Age 72 plus comorbidities', 'Age 72'],
    ['Age 72 plus diabetes', 'Age 72'],
    ['Age 72 and more importantly', 'Age 72'],
    ['Age 72 or older patients', 'Age 72']
  ])('still treats the single age in %s as a date', (text, spanText) => {
    const dates = detectPhi(text).filter((span) => span.category === 'DATE')
    expect(dates.map((span) => span.text)).toEqual([spanText])
  })

  // The rule id is what turned three rounds of guessing into one lookup; it is diagnostic only.
  it('names the rule that produced an age span', () => {
    expect(detectPhi('Age 72').map((span) => span.rule)).toEqual(['age-english'])
    expect(detectPhi('満72歳').map((span) => span.rule)).toEqual(['age-sai'])
  })

  // The defect this ticket closes: the guess used to require that the whole text carried no other
  // span, so a name next to an age or a date was never masked at all.
  it.each([
    ['山田太郎 65歳', 0, 4, 5, 8],
    ['山田太郎 2026-10-01', 0, 4, 5, 15],
    ['山田太郎 65歳 男性', 0, 4, 5, 8]
  ])('masks the name beside another span in %s', (text, nameStart, nameEnd, dateStart, dateEnd) => {
    const spans = detectPhi(text)
    const name = spans.find((span) => span.category === 'PERSON_NAME')
    const date = spans.find((span) => span.category === 'DATE')
    expect([name?.start, name?.end]).toEqual([nameStart, nameEnd])
    expect([date?.start, date?.end]).toEqual([dateStart, dateEnd])
    const result = deidentify(text, createMemoryPhiVault().store('fiction'))
    expect(result.text).not.toContain('山田太郎')
    expect(result.text).not.toContain('65歳')
    expect(result.text).not.toContain('2026-10-01')
  })

  // The same defect one line down: a pasted note puts the name on one line and the age on the next,
  // and the name then sits alone on its line. It must not be read as a heading.
  it('masks a name that shares a record with an age on the next line', () => {
    const text = readFileSync(join(SHORT_FIXTURE, 'records', 'name-with-age-newline.txt'), 'utf8')
    const spans = detectPhi(text)
    const name = spans.find((span) => span.category === 'PERSON_NAME')
    const date = spans.find((span) => span.category === 'DATE')
    expect([name?.start, name?.end, name?.text]).toEqual([0, 4, '山田太郎'])
    expect([date?.start, date?.end]).toEqual([5, 8])
    expect(deidentify(text, createMemoryPhiVault().store('fiction')).text).not.toContain('山田太郎')
  })

  // The name guess is bounded at 80 characters. Pinned as a miss, not as desired behaviour: the
  // record exists so the gap is measured, and it is owned by issue #103, which extends the window.
  it('pins the long-record gap: an unlabeled name past 80 characters stays unmasked', () => {
    const text = readFileSync(
      join(SHORT_FIXTURE, 'records', 'known-long-name-unmasked.txt'),
      'utf8'
    )
    expect(text.length).toBeGreaterThan(80)
    expect(text.startsWith('山田太郎')).toBe(true)
    expect(detectPhi(text).filter((span) => span.category === 'PERSON_NAME')).toEqual([])
  })

  // A romanized name is exported as SURNAME, GIVEN. That is the only shape in this branch that has
  // to survive a comma, which is otherwise a segment separator.
  it.each(['Smith, John', 'MISONO, KOTARO'])('keeps %s as one name', (text) => {
    expect(detectPhi(text).filter((span) => span.category === 'PERSON_NAME')).toHaveLength(1)
  })

  // The beta.20 incident: eight digits inside a hexadecimal identifier were read as an insurer number
  // and blocked five sends before the sixth failed. The rule is not windowed at 80 characters, so the
  // artifact record below is long on purpose.
  it.each([
    ['tool-artifact-metadata.txt', '02852897'],
    ['tool-uuid-tail.txt', '02852897'],
    ['tool-hex-hash.txt', '1234567890']
  ])('%s is released although it contains %s', (record, digits) => {
    const text = readFileSync(join(SHORT_FIXTURE, 'records', record), 'utf8')
    expect(text).toContain(digits)
    expect(detectPhi(text).filter((span) => span.category === 'INSURER_NO')).toEqual([])
  })

  // The same tight lookahead must not cost a real law code. The label is what carries the meaning:
  // these three forms are the ones a sentence and a table actually use.
  it.each([
    ['insurer-labeled.txt', 6, 14],
    ['insurer-label-particle.txt', 7, 15],
    ['insurer-label-pipe.txt', 8, 16]
  ])('%s still yields its insurer number', (record, start, end) => {
    const text = readFileSync(join(SHORT_FIXTURE, 'records', record), 'utf8')
    const spans = detectPhi(text).filter((span) => span.category === 'INSURER_NO')
    expect(spans.map((span) => [span.start, span.end, span.text])).toEqual([
      [start, end, '02123456']
    ])
  })

  // The literature block this ticket starts from: the PubMed MCP tool description carries example
  // PMIDs, and two of them sit in the law-code prefix table. The record is pinned at the offsets from
  // the incident log, so the scan covers the same 9 KB of text.
  it('releases the PubMed tool description whose example PMIDs are law-code shaped', () => {
    const text = readFileSync(join(SHORT_FIXTURE, 'records', 'tool-pubmed-description.txt'), 'utf8')
    expect(text.indexOf('33264437')).toBe(3721)
    expect(text.indexOf('34375400')).toBe(9009)
    expect(detectPhi(text).filter((span) => span.category === 'INSURER_NO')).toEqual([])
  })

  // The downgraded controls: a bare eight-digit run inside text is an id, not an insurer number.
  it.each([
    ['insurer-bare.txt', '症例は 02123456 の通り'],
    ['insurer-branch.txt', '02123456-1'],
    ['tool-id-decoy.txt', 'ID 33264437'],
    ['tool-account-number.txt', '口座番号 32165498']
  ])('%s carries no insurer number', (record, content) => {
    const text = readFileSync(join(SHORT_FIXTURE, 'records', record), 'utf8')
    expect(text).toBe(content)
    expect(detectPhi(text).filter((span) => span.category === 'INSURER_NO')).toEqual([])
  })

  // Pinned category gap: 保険証 with a number is not classified. It may be a ten-digit 被保険者番号,
  // and folding it into 保険者番号 would mix two categories just to make one record green.
  it('pins the 保険証 gap without folding it into the insurer category', () => {
    const text = readFileSync(
      join(SHORT_FIXTURE, 'records', 'known-insurance-card-unmasked.txt'),
      'utf8'
    )
    expect(detectPhi(text).filter((span) => span.category === 'INSURER_NO')).toEqual([])
    expect(detectPhi(text).filter((span) => span.category === 'INSURED_ID')).toEqual([])
  })

  // A UUID's first segment is eight hexadecimal characters too, bounded by `"` and `-`, so the
  // trailing-letter lookahead alone does not cover it.
  it('rejects the first segment of a UUID', () => {
    const text = '"version_id": "02852897-9f2b-4183-a8f3-1e2210368817"'
    expect(detectPhi(text).filter((span) => span.category === 'INSURER_NO')).toEqual([])
  })

  // Every gold line must point at the text it names. A span that covers a whole file and carries a
  // descriptive `text` scores exactly the same as a real one, so nothing else catches it: the PubMed
  // record was written that way and only a reader noticed. A gold entry that does not slice back to
  // its record is a lie about the fixture, and it is the first thing an integrity check would break on.
  it('points every gold line at the text in its record', () => {
    const gold = readFileSync(join(SHORT_FIXTURE, 'records_gold.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map(
        (line) =>
          JSON.parse(line) as {
            record: string
            start: number
            end: number
            text: string
          }
      )
    expect(gold).toHaveLength(60)
    for (const span of gold) {
      const text = readFileSync(join(SHORT_FIXTURE, 'records', span.record), 'utf8')
      expect({ record: span.record, slice: text.slice(span.start, span.end) }).toEqual({
        record: span.record,
        slice: span.text
      })
    }
  })
})
