// ICMJE-style disclosure drafted for the doctor to edit. This module only
// composes text. It does not submit a manuscript or decide authorship.

export type AiUsageRecord = {
  feature: string
  model: string
  purpose: string
}

export const COI_SENTENCE_JA = '著者は DRA の無償提供を受けた。'
export const COI_SENTENCE_EN = 'The authors received DRA free of charge.'

const MODEL_MISSING_JA = 'モデル名は記録されていない'
const MODEL_MISSING_EN = 'the model name was not recorded'

export const defaultAiUsageRecords = (): AiUsageRecord[] => [
  {
    feature: '文献の検索と整理',
    model: '',
    purpose: '関連研究の候補を集める'
  },
  {
    feature: '統計計画の下書き',
    model: '',
    purpose: '解析方針の草案を作る'
  },
  {
    feature: '原稿の下書き',
    model: '',
    purpose: '検証済みの結果から文章の草案を作る'
  },
  {
    feature: 'Notebookの結果の説明',
    model: '',
    purpose: '手元の実行結果を文章にまとめる'
  }
]

const clean = (value: string): string => value.replace(/\s+/g, ' ').trim()

const modelJa = (model: string): string => {
  const name = clean(model)
  return name.length > 0 ? name : MODEL_MISSING_JA
}

const modelEn = (model: string): string => {
  const name = clean(model)
  return name.length > 0 ? name : MODEL_MISSING_EN
}

const usageLines = (usages: readonly AiUsageRecord[]): { japanese: string; english: string } => {
  const recorded = usages.filter((usage) => clean(usage.feature).length > 0)
  if (recorded.length === 0) {
    return {
      japanese: '記録されたAI機能の使用はない。',
      english: 'No recorded AI feature was used.'
    }
  }
  return {
    japanese: recorded
      .map(
        (usage) =>
          `「${clean(usage.feature)}」（モデル: ${modelJa(usage.model)}）を${clean(usage.purpose) || '原稿作成'}のために使用した。`
      )
      .join(''),
    english: recorded
      .map(
        (usage) =>
          `${clean(usage.feature)} (model: ${modelEn(usage.model)}) was used for ${clean(usage.purpose) || 'manuscript preparation'}.`
      )
      .join(' ')
  }
}

export type AiUsageDeclaration = {
  japanese: string
  english: string
  draft: string
}

export const buildAiUsageDeclaration = (input: {
  usages: readonly AiUsageRecord[]
  includeCoi?: boolean
}): AiUsageDeclaration => {
  const lines = usageLines(input.usages)
  const japanese = `原稿の作成にあたり、次の人工知能（AI）機能を使用した。${lines.japanese}著者は原稿の内容について全責任を負い、人工知能を著者としては記載しない。記載内容は著者自身が確認した。`
  const english = `During preparation of this manuscript, the authors used the following artificial intelligence (AI) features. ${lines.english} The authors take full responsibility for the content of the manuscript, reviewed that content, and do not list artificial intelligence as an author.`
  const coi = input.includeCoi ? `\n\n${COI_SENTENCE_JA}\n${COI_SENTENCE_EN}` : ''
  return {
    japanese,
    english,
    draft: `${japanese}\n\n${english}${coi}\n`
  }
}

export const applyCoiChoice = (draft: string, includeCoi: boolean): string => {
  const without = draft
    .replaceAll(COI_SENTENCE_JA, '')
    .replaceAll(COI_SENTENCE_EN, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!includeCoi) return `${without}\n`
  return `${without}\n\n${COI_SENTENCE_JA}\n${COI_SENTENCE_EN}\n`
}
