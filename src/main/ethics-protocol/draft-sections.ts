import { R8_ITEMS, type R8ItemNumber } from '../../shared/ethics-protocol/r8-items'
import type { EthicsProtocolState } from '../../shared/ethics-protocol/state'

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
    const answer = choiceText(state.choices[number as keyof EthicsProtocolState['choices']])
    const text = reason ? `該当なし（${reason}）` : (answer ?? '【要記入】')

    if (text === '【要記入】') missingItems.push(number)
    return { item: number, text }
  })

  return { sections, missingItems }
}
