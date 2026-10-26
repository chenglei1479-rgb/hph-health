import { describe, expect, it } from 'vitest'
import {
  SEED_COMPANY_MODEL,
  SEED_EXHAUSTED_COPY,
  SEED_UI_COPY,
  seedDestinationCopy,
  seedStatus,
  seedUsageIsFree
} from './seed-invite'

describe('seed invite policy', () => {
  it('pins a mid-tier model and the approved exhausted copy', () => {
    expect(SEED_COMPANY_MODEL).toBe('gpt-5.4-mini')
    expect(SEED_EXHAUSTED_COPY).toContain('デモ（架空データ）と文献検索は引き続き使えます')
  })
  it('preserves the approved invitation redemption copy', () => {
    expect(SEED_UI_COPY.description).toBe(
      '招待コードをこの端末で一度だけ交換します。会社キーの全文は表示・出力されません。自備キーを登録するといつでも上書きできます。'
    )
  })
  it('switches the external destination with key mode', () => {
    expect(seedDestinationCopy('company')).toBe('運営が契約した AI（β は OpenAI）')
    expect(seedDestinationCopy('byok')).toBe('先生が登録した事業者')
    expect(seedDestinationCopy('none')).toBe('AI 事業者は未設定')
  })
  it('keeps demo and literature outside the two-package allowance', () => {
    expect(seedUsageIsFree('demo')).toBe(true)
    expect(seedUsageIsFree('literature')).toBe(true)
    expect(seedUsageIsFree('abstract-draft')).toBe(false)
    expect(
      seedStatus({
        redeemedAt: 1,
        packagesUsed: 2,
        companyProviderActive: true,
        byokProviderActive: false
      })
    ).toMatchObject({ mode: 'company', packagesRemaining: 0, exhausted: true })
  })
})
