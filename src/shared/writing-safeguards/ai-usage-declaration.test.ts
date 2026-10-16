import { describe, expect, it } from 'vitest'

import {
  applyCoiChoice,
  buildAiUsageDeclaration,
  coiCheckboxLabel,
  coiSentence,
  defaultAiUsageRecords
} from './ai-usage-declaration'

const published = { productName: 'Example Research', companyLegalName: 'Example KK' }

describe('AI usage declaration', () => {
  it('drafts a bilingual ICMJE paragraph the author can edit', () => {
    const declaration = buildAiUsageDeclaration({
      usages: [{ feature: '原稿の下書き', model: 'example-model', purpose: '考察の草案を作る' }]
    })
    expect(declaration.japanese).toContain('原稿の下書き')
    expect(declaration.japanese).toContain('example-model')
    expect(declaration.japanese).toContain('考察の草案を作る')
    expect(declaration.japanese).toContain('全責任を負い')
    expect(declaration.japanese).toContain('著者としては記載しない')
    expect(declaration.english).toContain('example-model')
    expect(declaration.english).toContain('full responsibility')
    expect(declaration.english).toContain('do not list artificial intelligence as an author')
    expect(declaration.draft).toContain(declaration.japanese)
    expect(declaration.draft).toContain(declaration.english)
    expect(declaration.draft).not.toContain(coiSentence('ja'))
  })

  it('names the configured product and leaves the company as a placeholder', () => {
    const declaration = buildAiUsageDeclaration({
      usages: defaultAiUsageRecords(),
      includeCoi: true
    })
    expect(declaration.draft).toContain(
      '本研究では、【運営会社名（未設定）】よりベースリオの無償提供を受けた。'
    )
    expect(declaration.draft).toContain(coiSentence('ja'))
    expect(declaration.draft).toContain(coiSentence('en'))
    expect(declaration.draft).toContain(
      'This study received Baselio free of charge from [Operating company name (not set)].'
    )
    expect(declaration.draft).not.toContain('DRA')
    expect(declaration.draft).not.toContain('著者は DRA の無償提供を受けた')
    expect(declaration.draft).toContain('モデル名は記録されていない')
    expect(declaration.english).toContain('the model name was not recorded')
  })

  it('uses the configured company and public product name', () => {
    expect(coiSentence('ja', published)).toBe(
      '本研究では、Example KKよりExample Researchの無償提供を受けた。'
    )
    expect(coiSentence('zh-Hans', published)).toBe('本研究从Example KK无偿获得了Example Research。')
    expect(coiSentence('zh-Hant', published)).toBe('本研究從Example KK無償取得了Example Research。')
    expect(coiSentence('en', published)).toBe(
      'This study received Example Research free of charge from Example KK.'
    )
    expect(coiSentence('ja', { companyLegalName: 'Example KK' })).toBe(
      '本研究では、Example KKよりベースリオの無償提供を受けた。'
    )
    expect(coiSentence('en', { productName: 'Example Research' })).toContain(
      '[Operating company name (not set)]'
    )
    expect(coiSentence('zh-Hans')).toBe('本研究从【运营公司名称（未设置）】无偿获得了Baselio。')
    expect(coiSentence('zh-Hant')).toBe('本研究從【營運公司名稱（未設定）】無償取得了Baselio。')
  })

  it('follows the selected language and does not put Japanese into Chinese or English', () => {
    const simplified = buildAiUsageDeclaration({
      usages: defaultAiUsageRecords('zh-Hans'),
      includeCoi: true,
      language: 'zh-CN'
    })
    expect(simplified.draft).toContain('在准备文稿时')
    expect(simplified.draft).toContain('文献检索与整理')
    expect(simplified.draft).toContain(coiSentence('zh-Hans'))
    expect(simplified.draft).toContain(coiSentence('en'))
    expect(simplified.draft).not.toContain('原稿の作成にあたり')
    expect(simplified.draft).not.toContain(coiSentence('ja'))
    expect(simplified.draft).not.toContain('DRA')
    expect(defaultAiUsageRecords('zh-Hans')[0]?.feature).toBe('文献检索与整理')

    const english = buildAiUsageDeclaration({
      usages: defaultAiUsageRecords('en'),
      includeCoi: true,
      language: 'en'
    })
    expect(english.draft).toContain('During preparation of this manuscript')
    expect(english.draft).toContain(coiSentence('en'))
    expect(english.draft).not.toContain('原稿の作成にあたり')
    expect(english.draft).not.toContain('研究支援ソフトウェア')
    expect(english.japanese).toBe('')
  })

  it('keeps an edited draft and still applies the conflict checkbox', () => {
    const edited = '著者が直した開示文です。\n\nThe authors edited this disclosure.\n'
    expect(applyCoiChoice(edited, true)).toContain(coiSentence('ja'))
    expect(applyCoiChoice(edited, true)).toContain(coiSentence('en'))
    expect(applyCoiChoice(applyCoiChoice(edited, true), false)).not.toContain(coiSentence('en'))
    expect(applyCoiChoice(applyCoiChoice(edited, true), false)).toContain(
      '著者が直した開示文です。'
    )
  })

  it('removes a previously saved development-code conflict sentence', () => {
    const legacy =
      '著者が直した開示文です。\n\n著者は DRA の無償提供を受けた。\nThe authors received DRA free of charge.\n'
    const cleared = applyCoiChoice(legacy, false)
    expect(cleared).not.toContain('DRA')
    expect(cleared).toContain('著者が直した開示文です。')
    const replaced = applyCoiChoice(legacy, true, 'zh-Hans', published)
    expect(replaced).toContain('本研究从Example KK无偿获得了Example Research。')
    expect(replaced).not.toContain('DRA')
    expect(replaced).not.toContain('【运营公司名称（未设置）】')
  })

  it('labels the sponsorship checkbox without a development code name', () => {
    for (const locale of ['ja', 'en', 'zh-CN', 'zh-TW', 'de', 'es', 'fr', 'ko', 'ru'] as const) {
      expect(coiCheckboxLabel(locale)).not.toContain('DRA')
    }
    expect(coiCheckboxLabel('ja')).toContain('【運営会社名（未設定）】')
    expect(coiCheckboxLabel('ja')).toContain('ベースリオ')
    expect(coiCheckboxLabel('en')).toContain('Baselio')
    expect(coiCheckboxLabel('zh-CN')).toContain('【运营公司名称（未设置）】')
    expect(coiCheckboxLabel('zh-TW')).toContain('【營運公司名稱（未設定）】')
    expect(coiCheckboxLabel('en')).toContain('[Operating company name (not set)]')
    expect(coiCheckboxLabel('de')).toContain('Interessenkonflikt-Satz hinzufügen')
    expect(coiCheckboxLabel('ja', published)).toContain('Example KK')
    expect(coiCheckboxLabel('ja', published)).toContain('Example Research')
    expect(coiCheckboxLabel('ja', published)).not.toContain('【運営会社名（未設定）】')
  })
})
