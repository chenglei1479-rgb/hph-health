import { R8_ITEMS, type R8ItemNumber } from './r8-items'

export type HeadingCandidate = {
  heading: string
  item: R8ItemNumber | null
  confidence: number
  status: '候補' | '対応不明'
}

export type ConfirmedHeadingMapping = HeadingCandidate & {
  item: R8ItemNumber
  confirmedBy: string
  confirmedAt: string
}

const aliases: Record<R8ItemNumber, readonly string[]> = Object.fromEntries(
  R8_ITEMS.map(({ number, title }) => [number, [title]])
) as Record<R8ItemNumber, readonly string[]>

Object.assign(aliases, {
  1: ['研究の名称', '研究課題名', '研究タイトル'],
  2: ['研究の実施体制', '実施体制', '研究組織'],
  3: ['研究の目的及び意義', '目的と意義', '研究目的'],
  4: ['研究の方法及び期間', '研究方法・研究期間', '方法と期間'],
  5: ['研究対象者の選定方針', '対象者の選択基準', '選定方針'],
  6: ['研究の科学的合理性の根拠', '科学的合理性', '科学的根拠'],
  7: ['インフォームド・コンセントを受ける手続等', '同意取得手続', '説明と同意'],
  8: ['個人情報等の取扱い', '個人情報の管理', 'プライバシー保護'],
  9: ['負担・リスク・利益、総合的評価、最小化対策', '負担、リスク及び利益', '予測される利益と危険'],
  10: ['試料・情報等の保管及び廃棄の方法', '試料・情報の保管と廃棄'],
  11: ['研究機関の長への報告内容及び方法', '機関の長への報告'],
  12: ['資金源・利益相反', '研究資金と利益相反'],
  13: ['研究に関する情報公開の方法', '情報公開'],
  14: ['研究により得られた結果等の取扱い', '研究結果の取扱い'],
  15: ['相談体制及び相談窓口（遺伝カウンセリングを含む）', '相談窓口'],
  16: ['代諾'],
  17: ['インフォームド・アセント', 'アセント'],
  18: ['第8の8（緊急状況）', '緊急状況下の研究'],
  19: ['経済的負担又は謝礼', '費用負担と謝礼'],
  20: ['重篤な有害事象への対応（侵襲）', '重篤な有害事象'],
  21: ['健康被害の補償（侵襲）', '健康被害の補償'],
  22: ['研究実施後の医療提供', '研究終了後の医療'],
  23: ['業務委託', '委託業務'],
  24: ['将来の研究・他機関提供', '将来利用及び他機関への提供'],
  25: ['モニタリング及び監査', 'モニタリング・監査']
})

const normalize = (value: string): string =>
  value.normalize('NFKC').replace(/[\s・、，,:：()（）/／]/gu, '')

export const mapHeading = (heading: string): HeadingCandidate => {
  const normalized = normalize(heading)
  const ranked = R8_ITEMS.map(({ number }) => {
    const score = Math.max(
      ...aliases[number].map((alias) => {
        const candidate = normalize(alias)
        if (normalized === candidate) return 1
        if (normalized.includes(candidate) || candidate.includes(normalized)) return 0.92
        const shared = [...new Set(normalized)].filter((char) => candidate.includes(char)).length
        return shared / Math.max(new Set(normalized).size, new Set(candidate).size)
      })
    )
    return { number, score }
  }).sort((a, b) => b.score - a.score)
  const best = ranked[0]
  return best.score >= 0.72 && best.score - ranked[1].score >= 0.08
    ? { heading, item: best.number, confidence: best.score, status: '候補' }
    : { heading, item: null, confidence: best.score, status: '対応不明' }
}

export const confirmHeadingMapping = (
  candidate: HeadingCandidate,
  item: R8ItemNumber,
  confirmedBy: string,
  confirmedAt: string
): ConfirmedHeadingMapping => {
  if (!confirmedBy.trim() || !confirmedAt.trim())
    throw new Error('Doctor confirmation is required.')
  return { ...candidate, item, confirmedBy, confirmedAt }
}
