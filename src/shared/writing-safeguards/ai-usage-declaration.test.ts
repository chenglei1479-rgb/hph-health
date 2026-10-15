import { describe, expect, it } from 'vitest'

import {
  applyCoiChoice,
  buildAiUsageDeclaration,
  COI_SENTENCE_EN,
  COI_SENTENCE_JA,
  COI_SENTENCE_ZH_HANS,
  defaultAiUsageRecords
} from './ai-usage-declaration'

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
    expect(declaration.draft).not.toContain(COI_SENTENCE_JA)
  })

  it('adds the optional DRA conflict sentence in Japanese and English', () => {
    const declaration = buildAiUsageDeclaration({
      usages: defaultAiUsageRecords(),
      includeCoi: true
    })
    expect(declaration.draft).toContain('DRA の無償提供を受けた')
    expect(declaration.draft).toContain(COI_SENTENCE_JA)
    expect(declaration.draft).toContain(COI_SENTENCE_EN)
    expect(declaration.draft).toContain('モデル名は記録されていない')
    expect(declaration.english).toContain('the model name was not recorded')
  })

  it('follows the selected language and does not put Japanese into Chinese or English', () => {
    const simplified = buildAiUsageDeclaration({
      usages: defaultAiUsageRecords('zh-Hans'),
      includeCoi: true,
      language: 'zh-CN'
    })
    expect(simplified.draft).toContain('在准备文稿时')
    expect(simplified.draft).toContain('文献检索与整理')
    expect(simplified.draft).toContain(COI_SENTENCE_ZH_HANS)
    expect(simplified.draft).toContain(COI_SENTENCE_EN)
    expect(simplified.draft).not.toContain('原稿の作成にあたり')
    expect(simplified.draft).not.toContain(COI_SENTENCE_JA)
    expect(defaultAiUsageRecords('zh-Hans')[0]?.feature).toBe('文献检索与整理')

    const english = buildAiUsageDeclaration({
      usages: defaultAiUsageRecords('en'),
      includeCoi: true,
      language: 'en'
    })
    expect(english.draft).toContain('During preparation of this manuscript')
    expect(english.draft).toContain(COI_SENTENCE_EN)
    expect(english.draft).not.toContain('原稿の作成にあたり')
    expect(english.draft).not.toContain(COI_SENTENCE_JA)
    expect(english.japanese).toBe('')
  })

  it('keeps an edited draft and still applies the conflict checkbox', () => {
    const edited = '著者が直した開示文です。\n\nThe authors edited this disclosure.\n'
    expect(applyCoiChoice(edited, true)).toContain(COI_SENTENCE_JA)
    expect(applyCoiChoice(edited, true)).toContain(COI_SENTENCE_EN)
    expect(applyCoiChoice(applyCoiChoice(edited, true), false)).not.toContain(COI_SENTENCE_EN)
    expect(applyCoiChoice(applyCoiChoice(edited, true), false)).toContain(
      '著者が直した開示文です。'
    )
  })
})
