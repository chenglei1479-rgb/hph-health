import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  createClosedGate,
  createVaultBackedGate,
  installMachineApproval,
  installPhiConfirmer,
  installPhiGate
} from '../../phi/gate'
import { ORDINARY_LABEL_VOCABULARY } from '../../phi/ordinary-label'
import { createMemoryPhiVault } from '../../phi/store'
import { releaseCategoricalValuesForModel } from './categorical-release'
import { gateNotebookOutputs } from './release-model-text'

beforeEach(() => {
  installPhiGate(createVaultBackedGate(createMemoryPhiVault()))
  installMachineApproval(() => true)
  installPhiConfirmer(null)
})
afterEach(() => {
  vi.useRealTimers()
  installPhiConfirmer(null)
  installMachineApproval(null)
})
const labels = ['男性', '女性', '東病棟', '肺癌']
const paths = [
  ['categorical labels', () => releaseCategoricalValuesForModel(labels, 'fiction')],
  ['aggregate table', () => gateNotebookOutputs({ table: 'sex,n\n男性,20\n女性,30' }, 'fiction')]
] as const
it('preserves benign Japanese labels but removes labeled names, chart numbers and era birth dates', async () => {
  const result = await releaseCategoricalValuesForModel(
    [...labels, '患者氏名：山田太郎', 'カルテ番号：0098765', '生年月日：昭和9年2月3日'],
    'fiction'
  )
  expect(result.slice(0, 4)).toEqual(labels)
  expect(JSON.stringify(result)).not.toMatch(/山田太郎|0098765|昭和9年2月3日/)
})
it.each(paths)(
  '%s never sends on an unavailable, broken or expired gate',
  async (_name, produce) => {
    for (const fault of ['uninitialized', 'throw', 'approval-error']) {
      installMachineApproval(() => true)
      installPhiGate(
        fault === 'uninitialized'
          ? null
          : fault === 'throw'
            ? createClosedGate('broken')
            : createVaultBackedGate(createMemoryPhiVault())
      )
      if (fault === 'approval-error') {
        installMachineApproval(() => {
          throw new Error('approval unavailable')
        })
      }
      const send = vi.fn()
      const pending = produce().then(send)
      const blocked = expect(pending).rejects.toThrow()
      await blocked
      expect(send).not.toHaveBeenCalled()
    }
  }
)
it('does not exempt a name guess mixed with another PHI category', async () => {
  const value = '男性 カルテ番号：0098765'
  const result = await releaseCategoricalValuesForModel([value], 'fiction')
  expect(result[0]).not.toContain('0098765')
})

it.each([
  '山田太郎',
  '仁科',
  '保科',
  '山田太郎内科',
  '山田病棟',
  '未登録ラベル',
  'label,n\n山田太郎,20',
  'sex,n\n男性 John Smith,20',
  'sex,n\n男性,20\n山田太郎,30'
])('does not extend the label exception to %s', async (text) => {
  const result = await releaseCategoricalValuesForModel([text], 'fiction')
  expect(result[0]).not.toBe(text)
})

it.each([
  ...Object.values(ORDINARY_LABEL_VOCABULARY).flat(),
  '東病棟',
  '西病棟',
  '内科',
  '外科',
  '3階病棟'
])('preserves listed categorical and aggregate label %s', async (label) => {
  expect(await releaseCategoricalValuesForModel([label], 'fiction')).toEqual([label])
  const table = `label,n\n${label},20`
  expect((await gateNotebookOutputs({ table }, 'fiction')).table).toBe(table)
})
