// ICMJE-style disclosure drafted for the doctor to edit. This module only
// composes text. It does not submit a manuscript or decide authorship.
// Omitting a language keeps the historical Japanese draft. The writing panel
// always passes the selected UI locale so Chinese and English do not show Japanese.

import { copyLocale } from '../copy-locale'
import type { Locale } from '../locale'
import {
  OPERATOR_COMPANY_LEGAL_NAME,
  PRODUCT_DISPLAY_NAME,
  PRODUCT_DISPLAY_NAME_JA,
  productNameIsPublic
} from '../product-identity'

export type AiUsageRecord = {
  feature: string
  model: string
  purpose: string
}

export type DisclosureIdentity = {
  productName?: string
  companyLegalName?: string
}

type DisclosureLocale = 'ja' | 'zh-Hans' | 'zh-Hant' | 'en'

const neutralProduct: Record<DisclosureLocale, string> = {
  ja: '研究支援ソフトウェア（開発コード名）',
  'zh-Hans': '研究支持软件（开发代号）',
  'zh-Hant': '研究支援軟體（開發代號）',
  en: 'research-support software (development code name)'
}

const companyPlaceholder: Record<DisclosureLocale, string> = {
  ja: '【運営会社名（未設定）】',
  'zh-Hans': '【运营公司名称（未设置）】',
  'zh-Hant': '【營運公司名稱（未設定）】',
  en: '[Operating company name (not set)]'
}

// Older drafts named the development code. Strip them when the checkbox changes
// so a saved disclosure does not keep that wording.
const LEGACY_COI_SENTENCES = [
  '著者は DRA の無償提供を受けた。',
  'The authors received DRA free of charge.',
  '作者免费获得了 DRA。',
  '作者免費取得了 DRA。'
]

const resolveIdentity = (
  identity?: DisclosureIdentity
): { productName: string; companyLegalName: string } => ({
  productName: identity?.productName ?? PRODUCT_DISPLAY_NAME,
  companyLegalName: identity?.companyLegalName ?? OPERATOR_COMPANY_LEGAL_NAME
})

export const disclosureProductPhrase = (locale: DisclosureLocale, productName: string): string => {
  const trimmed = productName.trim()
  if (!productNameIsPublic(trimmed)) return neutralProduct[locale]
  if (locale === 'ja' && trimmed === PRODUCT_DISPLAY_NAME) return PRODUCT_DISPLAY_NAME_JA
  return trimmed
}

export const disclosureCompanyName = (
  locale: DisclosureLocale,
  companyLegalName: string
): string => {
  const trimmed = companyLegalName.trim()
  return trimmed.length > 0 ? trimmed : companyPlaceholder[locale]
}

export const coiSentence = (locale: DisclosureLocale, identity?: DisclosureIdentity): string => {
  const resolved = resolveIdentity(identity)
  const company = disclosureCompanyName(locale, resolved.companyLegalName)
  const product = disclosureProductPhrase(locale, resolved.productName)
  if (locale === 'ja') return `本研究では、${company}より${product}の無償提供を受けた。`
  if (locale === 'zh-Hans') return `本研究从${company}无偿获得了${product}。`
  if (locale === 'zh-Hant') return `本研究從${company}無償取得了${product}。`
  return `This study received ${product} free of charge from ${company}.`
}

const coiLines = (locale: DisclosureLocale, identity?: DisclosureIdentity): readonly string[] =>
  locale === 'en'
    ? [coiSentence('en', identity)]
    : [coiSentence(locale, identity), coiSentence('en', identity)]

const sentencesToStrip = (identity?: DisclosureIdentity): readonly string[] => [
  ...LEGACY_COI_SENTENCES,
  coiSentence('ja', identity),
  coiSentence('zh-Hans', identity),
  coiSentence('zh-Hant', identity),
  coiSentence('en', identity)
]

export const coiCheckboxLabel = (language?: string, identity?: DisclosureIdentity): string => {
  const locale = copyLocale(language)
  const english = coiSentence('en', identity)
  if (locale === 'ja') return `利益相反の文を加える（${coiSentence('ja', identity)}／${english}）`
  if (locale === 'zh-Hans') {
    return `加入利益冲突声明（${coiSentence('zh-Hans', identity)}／${english}）`
  }
  if (locale === 'zh-Hant') {
    return `加入利益衝突聲明（${coiSentence('zh-Hant', identity)}／${english}）`
  }
  const intro: Record<Exclude<Locale, 'ja' | 'zh-Hans' | 'zh-Hant'>, string> = {
    en: 'Add a conflict-of-interest sentence',
    de: 'Interessenkonflikt-Satz hinzufügen',
    es: 'Añadir la frase de conflicto de intereses',
    fr: 'Ajouter la phrase sur le conflit d’intérêts',
    ko: '이해충돌 문장을 추가',
    ru: 'Добавить фразу о конфликте интересов'
  }
  return `${intro[locale]} (${english})`
}

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

const coiSuffix = (
  locale: DisclosureLocale,
  includeCoi: boolean | undefined,
  identity?: DisclosureIdentity
): string => (includeCoi ? `\n\n${coiLines(locale, identity).join('\n')}` : '')

export const buildAiUsageDeclaration = (input: {
  usages: readonly AiUsageRecord[]
  includeCoi?: boolean
  language?: string
  identity?: DisclosureIdentity
}): AiUsageDeclaration => {
  const locale = disclosureLocale(input.language)
  const copy = disclosureCopy[locale]
  const primary = paragraphFor(copy, input.usages)
  const english = paragraphFor(disclosureCopy.en, input.usages)
  const coi = coiSuffix(locale, input.includeCoi, input.identity)
  const draft = copy.includeEnglish ? `${primary}\n\n${english}${coi}\n` : `${primary}${coi}\n`
  return {
    japanese: locale === 'ja' ? primary : '',
    english,
    draft
  }
}

export const applyCoiChoice = (
  draft: string,
  includeCoi: boolean,
  language?: string,
  identity?: DisclosureIdentity
): string => {
  let without = draft
  for (const sentence of sentencesToStrip(identity)) without = without.replaceAll(sentence, '')
  without = without.replace(/\n{3,}/g, '\n\n').trim()
  if (!includeCoi) return `${without}\n`
  const locale = disclosureLocale(language)
  return `${without}\n\n${coiLines(locale, identity).join('\n')}\n`
}
