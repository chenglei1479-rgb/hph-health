import { describe, expect, it } from 'vitest'
import { emptyEthicsProtocolState } from '../../shared/ethics-protocol/state'
import { buildEthicsDraftSections } from './draft-sections'

describe('buildEthicsDraftSections', () => {
  it('fills the body from doctor answers and excludes completed items from the missing list', () => {
    const state = emptyEthicsProtocolState()
    state.choices = { 18: 'yes', 19: 'no', 22: 'unknown' }
    state.notApplicableReasons = { 3: '対象となる介入がないため' }

    const draft = buildEthicsDraftSections(state)

    expect(draft.sections.find(({ item }) => item === 18)?.text).toBe('はい')
    expect(draft.sections.find(({ item }) => item === 19)?.text).toBe('いいえ')
    expect(draft.sections.find(({ item }) => item === 3)?.text).toBe(
      '該当なし（対象となる介入がないため）'
    )
    expect(draft.missingItems).not.toContain(3)
    expect(draft.missingItems).not.toContain(18)
    expect(draft.missingItems).not.toContain(19)
    expect(draft.missingItems).toContain(22)
  })

  it('treats an empty not-applicable reason as missing', () => {
    const state = emptyEthicsProtocolState()
    state.notApplicableReasons = { 4: '   ' }

    const draft = buildEthicsDraftSections(state)

    expect(draft.sections.find(({ item }) => item === 4)?.text).toBe('【要記入】')
    expect(draft.missingItems).toContain(4)
  })

  it('exports doctor-authored content for non-conditional sections', () => {
    const state = emptyEthicsProtocolState()
    state.sectionTexts = { 1: '架空研究に関する医師の記載内容' }

    const draft = buildEthicsDraftSections(state)

    expect(draft.sections.find(({ item }) => item === 1)?.text).toBe(
      '架空研究に関する医師の記載内容'
    )
    expect(draft.missingItems).not.toContain(1)
  })

  it.each(['【要記入】', '〇〇', '※ 記入例を削除してください'])(
    'keeps placeholder-only section text missing: %s',
    (placeholder) => {
      const state = emptyEthicsProtocolState()
      state.sectionTexts = { 1: placeholder }

      const draft = buildEthicsDraftSections(state)

      expect(draft.sections.find(({ item }) => item === 1)?.text).toBe('【要記入】')
      expect(draft.missingItems).toContain(1)
    }
  )
})
