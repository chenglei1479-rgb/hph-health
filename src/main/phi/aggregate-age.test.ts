import { describe, expect, it } from 'vitest'

import { refuseConnectorQueryArgs, refusePatientQuery } from './gate'

// #170: beta.21 reported a summary as patient data because a mean age and a per-N-years rate
// denominator reached the gate as a plain `age-sai` span. These go through the same `patientSpans`
// projection the model-release gate uses, so a pass here means the rule id reached that projection.
describe('an aggregate age is not patient data', () => {
  it.each(['非欠測の平均年齢65歳', '年齢10歳当たりOR 1.98', 'n=12、年齢欠測1例'])(
    'does not refuse %s',
    (text) => {
      expect(() => refusePatientQuery(text)).not.toThrow()
      expect(() => refuseConnectorQueryArgs({ query: text })).not.toThrow()
    }
  )

  // The same rule list still refuses an age that names a person or a cohort member.
  it.each([
    '患者は65歳で糖尿病の既往がある。',
    '65歳、男性。',
    '65歳以上',
    '10歳代',
    '満65歳',
    '年齢65歳'
  ])('still refuses %s', (text) => {
    expect(() => refusePatientQuery(text)).toThrow()
    expect(() => refuseConnectorQueryArgs({ query: text })).toThrow()
  })
})
