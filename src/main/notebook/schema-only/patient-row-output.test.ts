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

  it('attributes a released aggregate to no branch', () => {
    const decision = patientRowAttribution('sex,mean,n\n男性,55.2,120\n女性,60.1,130')
    expect(decision.containsPatientRows).toBe(false)
    expect(decision.attribution.block).toBeNull()
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
