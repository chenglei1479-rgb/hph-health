import { describe, expect, it } from 'vitest'

import {
  applyCoiChoice,
  buildAiUsageDeclaration,
  COI_SENTENCE_EN,
  COI_SENTENCE_JA,
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
