import { describe, expect, it, vi } from 'vitest'
import { assertEthicsExportPhiSafe, EthicsExportPhiError } from './export-phi-gate'

describe('ethics export PHI gate', () => {
  it('blocks existing PHI detector matches', async () => {
    await expect(
      assertEthicsExportPhiSafe(['患者：山田 太郎、カルテ番号：0083341'])
    ).rejects.toMatchObject({ name: 'EthicsExportPhiError' })
  })
  it('fails closed when the detector throws', async () => {
    await expect(
      assertEthicsExportPhiSafe(['架空の文章'], {
        scan: () => {
          throw new Error('scanner failure')
        }
      })
    ).rejects.toBeInstanceOf(EthicsExportPhiError)
  })
  it('fails closed when the detector times out', async () => {
    vi.useFakeTimers()
    const pending = assertEthicsExportPhiSafe(['架空の文章'], {
      scan: () => new Promise(() => undefined),
      timeoutMs: 20
    })
    const assertion = expect(pending).rejects.toThrow('failed closed')
    await vi.advanceTimersByTimeAsync(20)
    await assertion
    vi.useRealTimers()
  })
  it('allows only an explicit clean scan', async () => {
    await expect(
      assertEthicsExportPhiSafe(['架空の研究計画'], { scan: () => [] })
    ).resolves.toBeUndefined()
  })
})
