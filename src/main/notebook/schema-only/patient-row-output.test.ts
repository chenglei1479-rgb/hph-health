import { describe, expect, it } from 'vitest'

import {
  notebookOutputContainsPatientRows,
  patientRowAttribution,
  PATIENT_ROW_BLOCK_MESSAGE
} from './patient-row-output'

const head = [
  '   age sex note',
  '0   17 男性 SECRET-9918',
  '1   40 女性 lab-only',
  '',
  '[2 rows x 3 columns]'
].join('\n')

describe('patient-row notebook output', () => {
  it('blocks .head() / .tail() / .sample() frames and other row views', () => {
    expect(notebookOutputContainsPatientRows(head)).toBe(true)
    expect(
      notebookOutputContainsPatientRows(
        ['    age sex note', '12   17 男性 SECRET-9918', '40   41 女性 lab-only'].join('\n')
      )
    ).toBe(true)
    expect(
      notebookOutputContainsPatientRows(['   age sex note', '3   72 男性 SECRET-1'].join('\n'))
    ).toBe(true)
    expect(
      notebookOutputContainsPatientRows(
        ['age,sex,note', '17,男性,SECRET-9918', '40,女性,lab-only'].join('\n')
      )
    ).toBe(true)
    expect(notebookOutputContainsPatientRows(['age,sex,note', '72,男性,SECRET-1'].join('\n'))).toBe(
      true
    )
    expect(
      notebookOutputContainsPatientRows(
        ["{'age': 17, 'sex': '男性'}", "{'age': 40, 'sex': '女性'}"].join('\n')
      )
    ).toBe(true)
    expect(
      notebookOutputContainsPatientRows(['age: 72', 'sex: 男性', 'note: SECRET-1'].join('\n'))
    ).toBe(true)
    expect(
      notebookOutputContainsPatientRows(
        ['age    72', 'sex    男性', 'Name: 3, dtype: object'].join('\n')
      )
    ).toBe(true)
    expect(
      notebookOutputContainsPatientRows(
        ['0    17', '1    40', 'Name: age, dtype: int64'].join('\n')
      )
    ).toBe(true)
    expect(PATIENT_ROW_BLOCK_MESSAGE).toContain('.head()')
    expect(PATIENT_ROW_BLOCK_MESSAGE).toContain('患者')
    expect(PATIENT_ROW_BLOCK_MESSAGE).not.toContain('SECRET')
  })

  it('lets aggregate summaries through', () => {
    expect(notebookOutputContainsPatientRows('sex,n\n男性,20\n女性,30')).toBe(false)
    expect(notebookOutputContainsPatientRows('group,n\nA,4\nB,20')).toBe(false)
    expect(notebookOutputContainsPatientRows('sex,mean,n\n男性,55.2,120\n女性,60.1,130')).toBe(
      false
    )
    expect(
      notebookOutputContainsPatientRows(['  sex  n', '0  男性  20', '1  女性  30'].join('\n'))
    ).toBe(false)
    expect(
      notebookOutputContainsPatientRows(
        [
          '       age',
          'count  5.0',
          'mean   40.0',
          'std    10.0',
          'min    17.0',
          'max    80.0'
        ].join('\n')
      )
    ).toBe(false)
    expect(
      notebookOutputContainsPatientRows(
        ['男性    20', '女性    30', 'Name: count, dtype: int64'].join('\n')
      )
    ).toBe(false)
    expect(notebookOutputContainsPatientRows("{'mean': 12.5, 'n': 40}")).toBe(false)
    expect(notebookOutputContainsPatientRows('mean: 12.5\nn: 40')).toBe(false)
    expect(notebookOutputContainsPatientRows('n=4')).toBe(false)
    expect(notebookOutputContainsPatientRows('ValueError: n=2 while reading 山田太郎')).toBe(false)
    expect(
      notebookOutputContainsPatientRows('Error: failed, see log\nCaused by: missing, value')
    ).toBe(false)
  })
})

// Locks the current gate baseline for the beta misjudgement: a genuine multi-key aggregate with
// more group keys than the aggregate heuristic allows is blocked, and the attribution names the
// reason with shape metrics only.
const multiKeyAggregate = [
  'site,sex,age_band,period,ward,mean,n',
  'A,男性,40s,2020,W1,55.2,12',
  'B,女性,50s,2021,W2,60.1,15'
].join('\n')

describe('patient-row gate attribution', () => {
  it('is blocked today, and says which branch and shape caused it', () => {
    const decision = patientRowAttribution(multiKeyAggregate)
    expect(decision.containsPatientRows).toBe(true)
    expect(decision.attribution.block).toBe('non-aggregate-table')
    expect(decision.attribution.tables).toBe(1)
    expect(decision.attribution.tableShapes[0]).toEqual({
      rows: 2,
      columns: 7,
      statHeaders: 2,
      groupKeys: 5,
      describe: false
    })
    expect(decision.attribution.describeTables).toBe(0)
    expect(decision.attribution.textLength).toBe(multiKeyAggregate.length)
    expect(decision.attribution.digest).toMatch(/^[0-9a-f]{12}$/)
  })

  it('carries no output text, cells, or variable names', () => {
    const payload = JSON.stringify(patientRowAttribution(multiKeyAggregate).attribution)
    const fragments = [
      'site',
      'sex',
      'age_band',
      'period',
      'ward',
      '男性',
      '女性',
      'W1',
      'W2',
      '55.2',
      '60.1'
    ]
    for (const fragment of fragments) expect(payload).not.toContain(fragment)
  })

  it('attributes a released aggregate to no branch and skips the forensic work', () => {
    const decision = patientRowAttribution('sex,mean,n\n男性,55.2,120\n女性,60.1,130')
    expect(decision.containsPatientRows).toBe(false)
    expect(decision.attribution.block).toBeNull()
    // Released output is neither fingerprinted nor scanned for a frame footer.
    expect(decision.attribution.digest).toBe('')
    expect(decision.attribution.frameFooter).toBe(false)
    expect(decision.attribution.tableShapes[0]).toEqual({
      rows: 2,
      columns: 3,
      statHeaders: 2,
      groupKeys: 1,
      describe: false
    })
  })

  it('attributes a pandas row frame to the table branch and reports the frame footer', () => {
    const decision = patientRowAttribution(head)
    expect(decision.attribution.block).toBe('non-aggregate-table')
    expect(decision.attribution.tables).toBe(1)
    expect(decision.attribution.frameFooter).toBe(true)
  })
})

// The beta.15 refusal, copied from the reported run: analysis.py printed one JSON summary line and
// then a six-row multi-group CSV. Both are aggregates and both used to be refused.
//
// Budget note: `events` was removed from the statistic vocabulary so that `id,events` patient frames
// are refused again. In this CSV that moves `events` into the group-key count, leaving
// variable/group/events = 3 against isAggregateTable's `groupKeys <= 4` limit — one spare key only.
// Adding two more non-statistic columns to this fixture would flip it to a refusal; that is the
// budget changing, not the beta.15 fix regressing.
const BETA15_JSON =
  '{"synthetic_only": true, "n": 240, "events": 40, "rate": 0.1667, "ci95_low": 0.121, "ci95_high": 0.221, "fisher_two_sided_p": 0.031, "missing_cells": 0, "duplicate_rows": 0}'
const BETA15_CSV = [
  'variable,group,n,events,rate,ci95_low,ci95_high',
  'age,F,122,22,0.1803,0.1216,0.2591',
  'age,M,118,18,0.1525,0.0987,0.2278',
  'sex,F,122,22,0.1803,0.1216,0.2591',
  'sex,M,118,18,0.1525,0.0987,0.2278',
  'readmitted_30d,F,122,22,0.1803,0.1216,0.2591',
  'readmitted_30d,M,118,18,0.1525,0.0987,0.2278'
].join('\n')

describe('beta.15 aggregate false positive', () => {
  it('releases the reported JSON summary plus multi-group CSV', () => {
    expect(notebookOutputContainsPatientRows(`${BETA15_JSON}\n${BETA15_CSV}`)).toBe(false)
    expect(notebookOutputContainsPatientRows(BETA15_CSV)).toBe(false)
    // Releasing the output must also mean no attribution branch claims it.
    const decision = patientRowAttribution(`${BETA15_JSON}\n${BETA15_CSV}`)
    expect(decision.containsPatientRows).toBe(false)
    expect(decision.attribution.block).toBeNull()
  })

  it('still refuses a .head()-style patient frame', () => {
    expect(
      notebookOutputContainsPatientRows(
        [
          'id,name,sex,age,readmitted',
          '0083341,山田太郎,男性,72,1',
          '0083342,佐藤花子,女性,65,0'
        ].join('\n')
      )
    ).toBe(true)
    expect(
      notebookOutputContainsPatientRows(
        [
          '   id     name sex age',
          '0   0083341 山田太郎 男性  72',
          '1   0083342 佐藤花子 女性  65'
        ].join('\n')
      )
    ).toBe(true)
  })

  it('still refuses a list of per-row dicts', () => {
    expect(
      notebookOutputContainsPatientRows(
        [
          "{'name': '山田太郎', 'age': 72, 'readmitted': 1}",
          "{'name': '佐藤花子', 'age': 65, 'readmitted': 0}"
        ].join('\n')
      )
    ).toBe(true)
    // A summary statistic list still reads as rows of a table, not as one object.
    expect(
      notebookOutputContainsPatientRows(
        ["{'mean': 12.5, 'n': 40}", "{'mean': 13.1, 'n': 41}"].join('\n')
      )
    ).toBe(true)
  })

  it('still refuses a single dict that carries patient identifiers', () => {
    expect(
      notebookOutputContainsPatientRows("{'patient_id': '0083341', 'hba1c': 7.2, 'age': 72}")
    ).toBe(true)
    expect(
      notebookOutputContainsPatientRows("{'name': '山田太郎', 'sex': '男性', 'readmitted': 1}")
    ).toBe(true)
    expect(
      notebookOutputContainsPatientRows('{"患者ID": "0083341", "年齢": 72, "性別": "男性"}')
    ).toBe(true)
  })

  it('refuses a single patient dict whose keys the identifier list cannot know', () => {
    // df.iloc[0].to_dict(): no identifier key, no identifier-looking names, and no statistic key.
    expect(notebookOutputContainsPatientRows("{'stage': 'II', 'size_cm': 3.1, 'nodes': 4}")).toBe(
      true
    )
    // Accepted conservative cost: a label-only dict with no statistic key is refused too.
    expect(notebookOutputContainsPatientRows("{'synthetic_only': true, 'mode': 'beta'}")).toBe(true)
  })

  it('refuses an id column next to a lone events column', () => {
    expect(
      notebookOutputContainsPatientRows(['id,events', '0083341,3', '0083342,1'].join('\n'))
    ).toBe(true)
    expect(
      notebookOutputContainsPatientRows(['patient_id,events', '0083341,3', '0083342,1'].join('\n'))
    ).toBe(true)
    expect(
      notebookOutputContainsPatientRows(['mrn,events', '0083341,3', '0083342,1'].join('\n'))
    ).toBe(true)
  })
})
