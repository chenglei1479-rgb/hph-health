import { describe, expect, it } from 'vitest'

import {
  applyCoiChoice,
  buildAiUsageDeclaration,
  coiCheckboxLabel,
  coiSentence,
  type AiUsageStatement
} from './ai-usage-declaration'

const published = { productName: 'Example Research', companyLegalName: 'Example KK' }

const statement = (overrides: Partial<AiUsageStatement> = {}): AiUsageStatement => ({
  feature: 'Notebook (python)',
  model: '',
  purpose: '記述統計を出す',
  evidence: { kind: 'notebook-run', runId: 'run-7f31' },
  ...overrides
})

describe('AI usage declaration', () => {
  // #133: the declaration used to start from four template rows, so a manuscript that only ran a
  // descriptive table still claimed literature search, a statistical plan and a drafted manuscript.
  it('states that nothing was executed when no execution is recorded', () => {
    const declaration = buildAiUsageDeclaration({ statements: [] })
    expect(declaration.draft).toContain(
      'このプロジェクトには、エージェントによる実行の記録がない。'
    )
    expect(declaration.draft).toContain('本原稿の作成に AI 機能を用いた実行は記録されていない。')
    expect(declaration.draft).not.toContain('文献の検索と整理')
    expect(declaration.draft).not.toContain('統計計画の下書き')
    expect(declaration.draft).not.toContain('原稿の下書き')
    expect(declaration.draft).not.toContain('次の人工知能（AI）機能を使用した。')
  })

  it('claims nothing about executions when the records could not be read', () => {
    const declaration = buildAiUsageDeclaration({ statements: [], records: 'unreadable' })
    expect(declaration.draft).not.toContain('エージェントによる実行の記録がない')
    expect(declaration.draft).not.toContain('次の人工知能（AI）機能を使用した。')
    // The one sentence the app can still stand behind.
    expect(declaration.draft).toContain('全責任を負い')
  })

  it('cites the execution each statement rests on', () => {
    const declaration = buildAiUsageDeclaration({
      statements: [statement()],
      language: 'en'
    })
    expect(declaration.english).toContain('Notebook (python)')
    expect(declaration.english).toContain('記述統計を出す')
    expect(declaration.english).toContain('execution id: run-7f31')

    const japanese = buildAiUsageDeclaration({ statements: [statement()] })
    expect(japanese.japanese).toContain('実行 ID: run-7f31')
    expect(japanese.english).toContain('execution id: run-7f31')
  })

  it('cites an artifact when that is what a statement rests on', () => {
    const declaration = buildAiUsageDeclaration({
      statements: [
        statement({ evidence: { kind: 'artifact', artifactId: 'artifact-42' }, purpose: '' })
      ]
    })
    expect(declaration.japanese).toContain('成果物 ID: artifact-42')
    expect(declaration.english).toContain('artifact id: artifact-42')
  })

  it('keeps the review sentence out of the text until the author confirms it', () => {
    const unconfirmed = buildAiUsageDeclaration({ statements: [statement()] })
    expect(unconfirmed.confirmed).toBe(false)
    expect(unconfirmed.japanese).toContain('全責任を負い')
    expect(unconfirmed.japanese).not.toContain('記載内容は著者自身が確認した。')
    expect(unconfirmed.english).not.toContain('The authors verified this declaration.')

    const confirmed = buildAiUsageDeclaration({ statements: [statement()], authorConfirmed: true })
    expect(confirmed.confirmed).toBe(true)
    expect(confirmed.japanese).toContain('記載内容は著者自身が確認した。')
    expect(confirmed.english).toContain('The authors verified this declaration.')
  })

  it('does not invent a purpose when the doctor has not written one', () => {
    const declaration = buildAiUsageDeclaration({
      statements: [statement({ purpose: '' })]
    })
    expect(declaration.japanese).not.toContain('のために使用した')
    expect(declaration.japanese).toContain('実行 ID: run-7f31')
    // The template's fallback purpose was "原稿作成"; an unwritten purpose must not reappear as it.
    expect(declaration.japanese).not.toContain('原稿作成')
  })

  it('names the missing model instead of inventing one', () => {
    const declaration = buildAiUsageDeclaration({
      statements: [statement({ model: '' })],
      includeCoi: true
    })
    expect(declaration.draft).toContain('モデル名は記録されていない')
    expect(declaration.english).toContain('the model name was not recorded')
    expect(declaration.draft).toContain(
      '本研究では、【運営会社名（未設定）】よりベースリオの無償提供を受けた。'
    )
    expect(declaration.draft).toContain(coiSentence('ja'))
    expect(declaration.draft).toContain(coiSentence('en'))
    expect(declaration.draft).not.toContain('DRA')
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
      statements: [statement()],
      includeCoi: true,
      language: 'zh-CN'
    })
    expect(simplified.draft).toContain('在准备文稿时')
    expect(simplified.draft).toContain('Notebook (python)')
    expect(simplified.draft).toContain(coiSentence('zh-Hans'))
    expect(simplified.draft).toContain(coiSentence('en'))
    expect(simplified.draft).not.toContain('原稿の作成にあたり')
    expect(simplified.draft).not.toContain(coiSentence('ja'))
    expect(simplified.draft).not.toContain('DRA')

    const english = buildAiUsageDeclaration({
      statements: [statement()],
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
