export const SEED_COMPANY_PROVIDER_ID = 'seed-company-openai'
export const SEED_COMPANY_MODEL = 'gpt-5.4-mini'
export const SEED_PACKAGE_LIMIT = 2

export const SEED_EXHAUSTED_COPY =
  'シード招待の AI 利用枠を使い切りました。続けるには、ご自身の OpenAI API キーを登録するか、将来の有料プランをご検討ください。デモ（架空データ）と文献検索は引き続き使えます。β／種では架空データのみご利用ください。病院の正式運用・実データは対象外です。'
export const SEED_UI_COPY = {
  title: 'シード招待枠',
  description:
    '招待コードをこの端末で一度だけ交換します。会社キーの全文は表示・出力されません。自備キーを登録するといつでも上書きできます。',
  code: '招待コード',
  redeem: '交換する',
  active: '招待枠を利用中',
  remaining: '抄録初稿＋一回修正：残り {{count}} セット',
  byok: '自備キーを利用中'
} as const

export type SeedKeyMode = 'company' | 'byok' | 'none'
export type SeedInviteStatus = {
  mode: SeedKeyMode
  redeemed: boolean
  packagesUsed: number
  packagesRemaining: number
  exhausted: boolean
  maskedKey?: string
}

export const seedDestinationCopy = (mode: SeedKeyMode): string =>
  mode === 'company'
    ? '運営が契約した AI（β は OpenAI）'
    : mode === 'byok'
      ? '先生が登録した事業者'
      : 'AI 事業者は未設定'

export const seedStatus = (input: {
  redeemedAt?: number
  packagesUsed?: number
  companyProviderActive: boolean
  byokProviderActive: boolean
  maskedKey?: string
}): SeedInviteStatus => {
  const packagesUsed = Math.max(0, Math.min(SEED_PACKAGE_LIMIT, input.packagesUsed ?? 0))
  const mode: SeedKeyMode = input.companyProviderActive
    ? 'company'
    : input.byokProviderActive
      ? 'byok'
      : 'none'
  return {
    mode,
    redeemed: input.redeemedAt !== undefined,
    packagesUsed,
    packagesRemaining: SEED_PACKAGE_LIMIT - packagesUsed,
    exhausted: packagesUsed >= SEED_PACKAGE_LIMIT,
    ...(input.maskedKey ? { maskedKey: input.maskedKey } : {})
  }
}

export type SeedUsageKind = 'abstract-draft' | 'abstract-revision' | 'demo' | 'literature' | 'other'
export const seedUsageIsFree = (kind: SeedUsageKind): boolean =>
  kind === 'demo' || kind === 'literature'

// A fresh status for profiles and backends predating seed invites. No key is active.
export const createDefaultSeedInviteStatus = (): SeedInviteStatus =>
  seedStatus({ companyProviderActive: false, byokProviderActive: false })
