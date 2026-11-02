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

export type AiUsageEvidence =
  { kind: 'notebook-run'; runId: string } | { kind: 'artifact'; artifactId: string }

// One statement is one recorded execution. `feature` and `purpose` are the doctor's words for
// what that execution was for; the evidence is what makes the sentence auditable instead of an
// assertion (#133).
export type AiUsageStatement = {
  feature: string
  model: string
  purpose: string
  evidence: AiUsageEvidence
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

type DisclosureCopy = {
  modelMissing: string
  evidenceLabel: Readonly<Record<AiUsageEvidence['kind'], string>>
  noExecution: string
  intro: string
  responsibility: string
  line: (feature: string, model: string, purpose: string, evidence: string) => string
  confirmedLine: string
  includeEnglish: boolean
}

const englishLine = (feature: string, model: string, purpose: string, evidence: string): string =>
  purpose.length > 0
    ? `${feature} (model: ${model}) was used for ${purpose} (${evidence}).`
    : `${feature} (model: ${model}) was used (${evidence}).`

const disclosureCopy: Record<DisclosureLocale, DisclosureCopy> = {
  ja: {
    modelMissing: 'モデル名は記録されていない',
    evidenceLabel: { 'notebook-run': '実行 ID', artifact: '成果物 ID' },
    noExecution:
      'このプロジェクトには、エージェントによる実行の記録がない。したがって、本原稿の作成に AI 機能を用いた実行は記録されていない。',
    intro: '原稿の作成にあたり、次の人工知能（AI）機能を使用した。',
    responsibility: '著者は原稿の内容について全責任を負い、人工知能を著者としては記載しない。',
    line: (feature, model, purpose, evidence) =>
      purpose.length > 0
        ? `「${feature}」（モデル: ${model}）を${purpose}のために使用した（${evidence}）。`
        : `「${feature}」（モデル: ${model}）を使用した（${evidence}）。`,
    confirmedLine: '記載内容は著者自身が確認した。',
    includeEnglish: true
  },
  'zh-Hans': {
    modelMissing: '未记录模型名称',
    evidenceLabel: { 'notebook-run': '运行 ID', artifact: '产物 ID' },
    noExecution: '本项目没有智能体执行的记录。因此，本稿件中没有记录到使用 AI 功能的执行。',
    intro: '在准备文稿时，使用了下列人工智能（AI）功能。',
    responsibility: '作者对文稿内容承担全部责任，不将人工智能列为作者。',
    line: (feature, model, purpose, evidence) =>
      purpose.length > 0
        ? `使用了「${feature}」（模型：${model}），用于${purpose}（${evidence}）。`
        : `使用了「${feature}」（模型：${model}）（${evidence}）。`,
    confirmedLine: '所列内容已经作者本人核对。',
    includeEnglish: true
  },
  'zh-Hant': {
    modelMissing: '未記錄模型名稱',
    evidenceLabel: { 'notebook-run': '執行 ID', artifact: '產物 ID' },
    noExecution: '本專案沒有智慧體執行的記錄。因此，本稿件中沒有記錄到使用 AI 功能的執行。',
    intro: '在準備文稿時，使用了下列人工智慧（AI）功能。',
    responsibility: '作者對文稿內容承擔全部責任，不將人工智慧列為作者。',
    line: (feature, model, purpose, evidence) =>
      purpose.length > 0
        ? `使用了「${feature}」（模型：${model}），用於${purpose}（${evidence}）。`
        : `使用了「${feature}」（模型：${model}）（${evidence}）。`,
    confirmedLine: '所列內容已經作者本人核對。',
    includeEnglish: true
  },
  en: {
    modelMissing: 'the model name was not recorded',
    evidenceLabel: { 'notebook-run': 'execution id', artifact: 'artifact id' },
    noExecution:
      'No agent execution is recorded for this project, so no execution of an AI feature is recorded for this manuscript.',
    intro:
      'During preparation of this manuscript, the authors used the following artificial intelligence (AI) features.',
    responsibility:
      'The authors take full responsibility for the content of the manuscript and do not list artificial intelligence as an author.',
    line: englishLine,
    confirmedLine: 'The authors verified this declaration.',
    includeEnglish: false
  }
}

const clean = (value: string): string => value.replace(/\s+/g, ' ').trim()

const evidenceText = (copy: DisclosureCopy, evidence: AiUsageEvidence): string => {
  const label = copy.evidenceLabel[evidence.kind]
  const id = evidence.kind === 'notebook-run' ? evidence.runId : evidence.artifactId
  return `${label}: ${clean(id)}`
}

export type AiUsageRecordsState = 'recorded' | 'none' | 'unreadable'

const paragraphFor = (
  copy: DisclosureCopy,
  statements: readonly AiUsageStatement[],
  records: AiUsageRecordsState
): string => {
  const recorded = statements.filter((statement) => clean(statement.feature).length > 0)
  // "unreadable" says nothing about executions at all: claiming "none were recorded" when the
  // records could not be read is the same class of false statement as the template rows (#133).
  if (records === 'unreadable') return copy.responsibility
  if (recorded.length === 0) return `${copy.noExecution}${copy.responsibility}`
  const body = recorded
    .map((statement) => {
      const model = clean(statement.model)
      return copy.line(
        clean(statement.feature),
        model.length > 0 ? model : copy.modelMissing,
        clean(statement.purpose),
        evidenceText(copy, statement.evidence)
      )
    })
    .join(copy === disclosureCopy.en ? ' ' : '')
  const separator = copy === disclosureCopy.en ? ' ' : ''
  return `${copy.intro}${body}${separator}${copy.responsibility}`
}

export type AiUsageDeclaration = {
  japanese: string
  english: string
  draft: string
  // The review clause is only in the text once the author confirms it; the panel shows the
  // unconfirmed state until then.
  confirmed: boolean
}

const coiSuffix = (
  locale: DisclosureLocale,
  includeCoi: boolean | undefined,
  identity?: DisclosureIdentity
): string => (includeCoi ? `\n\n${coiLines(locale, identity).join('\n')}` : '')

const paragraphWithConfirmation = (
  copy: DisclosureCopy,
  statements: readonly AiUsageStatement[],
  confirmed: boolean,
  records: AiUsageRecordsState
): string => {
  const paragraph = paragraphFor(copy, statements, records)
  if (!confirmed) return paragraph
  const hasStatements = statements.some((statement) => clean(statement.feature).length > 0)
  return hasStatements && records === 'recorded'
    ? `${paragraph}${copy.confirmedLine}`
    : `${paragraph} ${copy.confirmedLine}`
}

export const buildAiUsageDeclaration = (input: {
  statements: readonly AiUsageStatement[]
  // What the run records said. The caller passes this because only it knows whether the read
  // succeeded; defaulting to "no statements means nothing ran" would make an unreadable read
  // indistinguishable from an empty project.
  records?: AiUsageRecordsState
  includeCoi?: boolean
  language?: string
  identity?: DisclosureIdentity
  authorConfirmed?: boolean
}): AiUsageDeclaration => {
  const locale = disclosureLocale(input.language)
  const copy = disclosureCopy[locale]
  const confirmed = input.authorConfirmed === true
  const hasStatements = input.statements.some((statement) => clean(statement.feature).length > 0)
  const records = input.records ?? (hasStatements ? 'recorded' : 'none')
  const primary = paragraphWithConfirmation(copy, input.statements, confirmed, records)
  const english = paragraphWithConfirmation(disclosureCopy.en, input.statements, confirmed, records)
  const coi = coiSuffix(locale, input.includeCoi, input.identity)
  const draft = copy.includeEnglish ? `${primary}\n\n${english}${coi}\n` : `${primary}${coi}\n`
  return {
    japanese: locale === 'ja' ? primary : '',
    english,
    draft,
    confirmed
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
