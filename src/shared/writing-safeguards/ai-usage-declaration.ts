// ICMJE-style disclosure drafted for the doctor to edit. This module only
// composes text. It does not submit a manuscript or decide authorship.
// Omitting a language keeps the historical Japanese draft. The writing panel
// always passes the selected UI locale so Chinese and English do not show Japanese.

import { copyLocale } from '../copy-locale'

export type AiUsageRecord = {
  feature: string
  model: string
  purpose: string
}

export const COI_SENTENCE_JA = '著者は DRA の無償提供を受けた。'
export const COI_SENTENCE_EN = 'The authors received DRA free of charge.'
export const COI_SENTENCE_ZH_HANS = '作者免费获得了 DRA。'
export const COI_SENTENCE_ZH_HANT = '作者免費取得了 DRA。'

const COI_SENTENCES = [COI_SENTENCE_JA, COI_SENTENCE_ZH_HANS, COI_SENTENCE_ZH_HANT, COI_SENTENCE_EN]

type DisclosureLocale = 'ja' | 'zh-Hans' | 'zh-Hant' | 'en'

const disclosureLocale = (language?: string): DisclosureLocale => {
  if (!language) return 'ja'
  const locale = copyLocale(language)
  if (locale === 'ja' || locale === 'zh-Hans' || locale === 'zh-Hant') return locale
  return 'en'
}

type UsageTemplate = { feature: string; purpose: string }

type DisclosureCopy = {
  usages: readonly UsageTemplate[]
  modelMissing: string
  purposeFallback: string
  empty: string
  line: (feature: string, model: string, purpose: string) => string
  lead: (body: string) => string
  coi: readonly string[]
  includeEnglish: boolean
}

const englishLead = (body: string): string =>
  `During preparation of this manuscript, the authors used the following artificial intelligence (AI) features. ${body} The authors take full responsibility for the content of the manuscript, reviewed that content, and do not list artificial intelligence as an author.`

const englishLine = (feature: string, model: string, purpose: string): string =>
  `${feature} (model: ${model}) was used for ${purpose}.`

const disclosureCopy: Record<DisclosureLocale, DisclosureCopy> = {
  ja: {
    usages: [
      { feature: '文献の検索と整理', purpose: '関連研究の候補を集める' },
      { feature: '統計計画の下書き', purpose: '解析方針の草案を作る' },
      { feature: '原稿の下書き', purpose: '検証済みの結果から文章の草案を作る' },
      { feature: 'Notebookの結果の説明', purpose: '手元の実行結果を文章にまとめる' }
    ],
    modelMissing: 'モデル名は記録されていない',
    purposeFallback: '原稿作成',
    empty: '記録されたAI機能の使用はない。',
    line: (feature, model, purpose) =>
      `「${feature}」（モデル: ${model}）を${purpose}のために使用した。`,
    lead: (body) =>
      `原稿の作成にあたり、次の人工知能（AI）機能を使用した。${body}著者は原稿の内容について全責任を負い、人工知能を著者としては記載しない。記載内容は著者自身が確認した。`,
    coi: [COI_SENTENCE_JA, COI_SENTENCE_EN],
    includeEnglish: true
  },
  'zh-Hans': {
    usages: [
      { feature: '文献检索与整理', purpose: '收集相关研究候选' },
      { feature: '统计计划草稿', purpose: '起草分析方案' },
      { feature: '文稿草稿', purpose: '根据已核实的结果起草正文' },
      { feature: 'Notebook 结果说明', purpose: '把本机运行结果整理成文字' }
    ],
    modelMissing: '未记录模型名称',
    purposeFallback: '文稿准备',
    empty: '没有记录到 AI 功能的使用。',
    line: (feature, model, purpose) => `使用了「${feature}」（模型：${model}），用于${purpose}。`,
    lead: (body) =>
      `在准备文稿时，使用了下列人工智能（AI）功能。${body}作者对文稿内容承担全部责任，不将人工智能列为作者。所列内容已经作者本人核对。`,
    coi: [COI_SENTENCE_ZH_HANS, COI_SENTENCE_EN],
    includeEnglish: true
  },
  'zh-Hant': {
    usages: [
      { feature: '文獻檢索與整理', purpose: '收集相關研究候選' },
      { feature: '統計計畫草稿', purpose: '起草分析方案' },
      { feature: '文稿草稿', purpose: '根據已核實的結果起草正文' },
      { feature: 'Notebook 結果說明', purpose: '把本機執行結果整理成文字' }
    ],
    modelMissing: '未記錄模型名稱',
    purposeFallback: '文稿準備',
    empty: '沒有記錄到 AI 功能的使用。',
    line: (feature, model, purpose) => `使用了「${feature}」（模型：${model}），用於${purpose}。`,
    lead: (body) =>
      `在準備文稿時，使用了下列人工智慧（AI）功能。${body}作者對文稿內容承擔全部責任，不將人工智慧列為作者。所列內容已經作者本人核對。`,
    coi: [COI_SENTENCE_ZH_HANT, COI_SENTENCE_EN],
    includeEnglish: true
  },
  en: {
    usages: [
      {
        feature: 'Literature search and organization',
        purpose: 'gather candidate related studies'
      },
      { feature: 'Statistical plan draft', purpose: 'draft an analysis plan' },
      { feature: 'Manuscript draft', purpose: 'draft prose from verified results' },
      {
        feature: 'Explanation of Notebook results',
        purpose: 'summarize results run on this computer'
      }
    ],
    modelMissing: 'the model name was not recorded',
    purposeFallback: 'manuscript preparation',
    empty: 'No recorded AI feature was used.',
    line: englishLine,
    lead: englishLead,
    coi: [COI_SENTENCE_EN],
    includeEnglish: false
  }
}

const clean = (value: string): string => value.replace(/\s+/g, ' ').trim()

const paragraphFor = (copy: DisclosureCopy, usages: readonly AiUsageRecord[]): string => {
  const recorded = usages.filter((usage) => clean(usage.feature).length > 0)
  if (recorded.length === 0) return copy.lead(copy.empty)
  const body = recorded
    .map((usage) => {
      const model = clean(usage.model)
      return copy.line(
        clean(usage.feature),
        model.length > 0 ? model : copy.modelMissing,
        clean(usage.purpose) || copy.purposeFallback
      )
    })
    .join(copy === disclosureCopy.en ? ' ' : '')
  return copy.lead(body)
}

export const defaultAiUsageRecords = (language?: string): AiUsageRecord[] =>
  disclosureCopy[disclosureLocale(language)].usages.map((usage) => ({
    feature: usage.feature,
    model: '',
    purpose: usage.purpose
  }))

export type AiUsageDeclaration = {
  japanese: string
  english: string
  draft: string
}

const coiSuffix = (copy: DisclosureCopy, includeCoi: boolean | undefined): string =>
  includeCoi ? `\n\n${copy.coi.join('\n')}` : ''

export const buildAiUsageDeclaration = (input: {
  usages: readonly AiUsageRecord[]
  includeCoi?: boolean
  language?: string
}): AiUsageDeclaration => {
  const locale = disclosureLocale(input.language)
  const copy = disclosureCopy[locale]
  const primary = paragraphFor(copy, input.usages)
  const english = paragraphFor(disclosureCopy.en, input.usages)
  const coi = coiSuffix(copy, input.includeCoi)
  const draft = copy.includeEnglish ? `${primary}\n\n${english}${coi}\n` : `${primary}${coi}\n`
  return {
    japanese: locale === 'ja' ? primary : '',
    english,
    draft
  }
}

export const applyCoiChoice = (draft: string, includeCoi: boolean, language?: string): string => {
  let without = draft
  for (const sentence of COI_SENTENCES) without = without.replaceAll(sentence, '')
  without = without.replace(/\n{3,}/g, '\n\n').trim()
  if (!includeCoi) return `${without}\n`
  const copy = disclosureCopy[disclosureLocale(language)]
  return `${without}\n\n${copy.coi.join('\n')}\n`
}
