import { R8_ITEMS, type R8ItemNumber } from '../../shared/ethics-protocol/r8-items'
import type { EthicsProtocolState } from '../../shared/ethics-protocol/state'
import {
  evaluateR8ItemCompleteness,
  formatNotApplicableText,
  hasMeaningfulTemplateContent
} from '../../shared/ethics-protocol/completeness'

export type EthicsDraftSection = { item: R8ItemNumber; text: string }

const choiceText = (choice: EthicsProtocolState['choices'][18]): string | undefined => {
  if (choice === 'yes') return 'はい'
  if (choice === 'no') return 'いいえ'
  return undefined
}

export const buildEthicsDraftSections = (
  state: EthicsProtocolState
): { sections: EthicsDraftSection[]; missingItems: R8ItemNumber[] } => {
  const missingItems: R8ItemNumber[] = []
  const sections = R8_ITEMS.map(({ number }) => {
    const reason = state.notApplicableReasons[number]?.trim()
    const markedNotApplicable = state.notApplicableItems?.includes(number) ?? false
    const answer = choiceText(state.choices[number as keyof EthicsProtocolState['choices']])
    const rawSectionText = state.sectionTexts?.[number]?.trim()
    const sectionText =
      rawSectionText && hasMeaningfulTemplateContent(rawSectionText) ? rawSectionText : undefined
    const text = reason
      ? formatNotApplicableText(number, reason)
      : markedNotApplicable
        ? '該当なし'
        : (answer ?? sectionText ?? '【要記入】')

    if (evaluateR8ItemCompleteness(number, text) !== '記載あり') missingItems.push(number)
    return { item: number, text }
  })

  return { sections, missingItems }
}
