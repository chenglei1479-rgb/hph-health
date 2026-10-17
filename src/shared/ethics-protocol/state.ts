import type { R8ItemNumber } from './r8-items'
import type { HeadingCandidate } from './heading-mapper'

export type EthicsChecklistChoice = 'yes' | 'no' | 'unknown'
export type EthicsProtocolState = {
  choices: Partial<Record<18 | 19 | 22 | 23 | 24, EthicsChecklistChoice>>
  notApplicableReasons: Partial<Record<R8ItemNumber, string>>
  confirmedMappings: Array<{
    heading: string
    item: R8ItemNumber
    confirmedBy: string
    confirmedAt: string
  }>
  headingCandidates?: HeadingCandidate[]
  importedDocxPath?: string
}

export const emptyEthicsProtocolState = (): EthicsProtocolState => ({
  choices: {},
  notApplicableReasons: {},
  confirmedMappings: []
})
