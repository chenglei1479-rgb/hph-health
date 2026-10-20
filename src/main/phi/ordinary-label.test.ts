import { expect, it } from 'vitest'
import { hasOnlyOrdinaryLabelPhi, isOrdinaryLabel } from './ordinary-label'

it.each([
  '仁科',
  '保科',
  '山田太郎内科',
  '山田病棟',
  '未登録科',
  '東病棟 山田',
  '1234病棟',
  '１２３４病棟',
  '一二三四病棟',
  '1234階病棟',
  '1234567病棟',
  '123456階病棟'
])('does not exempt %s', (label) => expect(isOrdinaryLabel(label)).toBe(false))
it.each([
  '内科',
  '東病棟',
  '3階病棟',
  '北東病棟',
  '１２病棟',
  '三階病棟',
  '123病棟',
  '１２３病棟',
  '123階病棟'
])('admits the bounded label %s', (label) => expect(isOrdinaryLabel(label)).toBe(true))
it('does not exempt another PHI category even inside a listed cell', () => {
  expect(hasOnlyOrdinaryLabelPhi('3階病棟', [{ start: 0, end: 1, category: 'KARTE_NO' }])).toBe(
    false
  )
  expect(
    hasOnlyOrdinaryLabelPhi('label,n\n山田病棟,20', [{ start: 8, end: 12, category: 'FACILITY' }])
  ).toBe(false)
})
