export const R8_RULESET_VERSION = 'r8-beta-0.1'

export type R8ItemNumber =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23
  | 24
  | 25

export type R8Item = {
  number: R8ItemNumber
  title: string
  required: boolean
  structureOnly: boolean
}

const item = (
  number: R8ItemNumber,
  title: string,
  required = number <= 15,
  structureOnly = false
): R8Item => ({ number, title, required, structureOnly })

export const R8_ITEMS = [
  item(1, '研究の名称'),
  item(2, '研究の実施体制'),
  item(3, '研究の目的及び意義'),
  item(4, '研究の方法及び期間'),
  item(5, '研究対象者の選定方針'),
  item(6, '研究の科学的合理性の根拠'),
  item(7, 'インフォームド・コンセントを受ける手続等'),
  item(8, '個人情報等の取扱い'),
  item(9, '負担・リスク・利益、総合的評価、最小化対策'),
  item(10, '試料・情報等の保管及び廃棄の方法'),
  item(11, '研究機関の長への報告内容及び方法'),
  item(12, '資金源・利益相反', true, true),
  item(13, '研究に関する情報公開の方法'),
  item(14, '研究により得られた結果等の取扱い'),
  item(15, '相談体制及び相談窓口（遺伝カウンセリングを含む）'),
  item(16, '代諾'),
  item(17, 'インフォームド・アセント'),
  item(18, '第8の8（緊急状況）', false, true),
  item(19, '経済的負担又は謝礼'),
  item(20, '重篤な有害事象への対応（侵襲）', false, true),
  item(21, '健康被害の補償（侵襲）', false, true),
  item(22, '研究実施後の医療提供', false, true),
  item(23, '業務委託'),
  item(24, '将来の研究・他機関提供'),
  item(25, 'モニタリング及び監査', false, true)
] as const satisfies readonly R8Item[]

export const R8_COLLECTION_ONLY_NOTICE = '試料・情報の収集・提供（指針第7⑵）は β では未対応です'
