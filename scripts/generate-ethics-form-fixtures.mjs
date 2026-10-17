import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const variants = [
  ['架空市立さくら病院', 'standard'],
  ['架空みなと医療センター', 'shuffled'],
  ['架空青葉大学病院', 'table'],
  ['架空東部総合病院', 'placeholders'],
  ['架空西山記念病院', 'partial'],
  ['架空中央こども病院', 'legacy-terms'],
  ['架空北浜医療機構', 'consent-conflict'],
  ['架空南町研究病院', 'complex-style'],
  ['架空ひかり病院', 'missing-fields'],
  ['架空若葉医療院', 'header-name'],
  ['架空未来大学附属病院', 'collection-only'],
  ['架空つばさ病院', 'fallback-order']
]
const titles = [
  '研究課題名',
  '実施体制',
  '目的と意義',
  '研究方法・研究期間',
  '対象者の選択基準',
  '科学的合理性',
  '同意取得手続',
  '個人情報の管理',
  '負担、リスク及び利益',
  '試料・情報の保管と廃棄',
  '機関の長への報告',
  '研究資金と利益相反',
  '情報公開',
  '研究結果の取扱い',
  '相談窓口',
  '代諾',
  'アセント',
  '緊急状況下の研究',
  '費用負担と謝礼',
  '重篤な有害事象',
  '健康被害の補償',
  '研究終了後の医療',
  '委託業務',
  '将来利用及び他機関への提供',
  'モニタリング・監査'
]
const root = resolve('test/fixtures/ethics-forms')
mkdirSync(root, { recursive: true })
variants.forEach(([institution, kind], index) => {
  const headings = titles.map((text, item) => ({ text, item: item + 1 }))
  if (kind === 'shuffled') headings.reverse()
  if (kind === 'missing-fields') headings.splice(12, 2)
  writeFileSync(
    resolve(root, `${String(index + 1).padStart(2, '0')}-${kind}.json`),
    `${JSON.stringify({ institution, kind, headings }, null, 2)}\n`
  )
})
