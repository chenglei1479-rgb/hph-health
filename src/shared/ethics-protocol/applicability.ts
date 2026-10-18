import { R8_ITEMS, type R8ItemNumber } from './r8-items'

export type ConfirmedAnswer = {
  value: 'yes' | 'no' | 'unknown' | 'unanswered' | 'minor-invasion' | '軽微な侵襲'
  quote?: string
  confirmedBy?: string
  confirmedAt?: string
}

export type Applicability = 'required' | 'not-applicable' | 'needs-review'

export type ApplicabilityResult = {
  item: R8ItemNumber
  applicability: Applicability
  reason: string
  evidence?: string
  guidancePending: boolean
}

export type ApplicabilityAnswers = Partial<Record<R8ItemNumber, ConfirmedAnswer>>

export type ConditionalInputs = {
  nodes: Partial<Record<'Q1a_侵襲' | 'Q1b_介入' | 'Q4d_代諾・アセント', ConfirmedAnswer>>
  checklist: Partial<Record<18 | 19 | 22 | 23 | 24, ConfirmedAnswer>>
}

const isConfirmed = (answer: ConfirmedAnswer | undefined): answer is ConfirmedAnswer =>
  Boolean(answer?.confirmedBy?.trim() && answer.confirmedAt?.trim())

export const assessR8Applicability = (answers: ApplicabilityAnswers): ApplicabilityResult[] =>
  R8_ITEMS.map((definition) => {
    if (definition.required) {
      return {
        item: definition.number,
        applicability: 'required',
        reason: '指針第7⑴の必須項目',
        guidancePending: false
      }
    }

    const answer = answers[definition.number]
    if (!isConfirmed(answer) || answer.value === 'unknown' || answer.value === 'unanswered') {
      return {
        item: definition.number,
        applicability: 'needs-review',
        reason: '研究責任者による回答の確認が必要',
        evidence: answer?.quote,
        guidancePending: true
      }
    }

    return {
      item: definition.number,
      applicability: answer.value === 'yes' ? 'required' : 'not-applicable',
      reason: '研究責任者が確認した回答に基づく判定',
      evidence: answer.quote,
      guidancePending: false
    }
  })

const fromConfirmedAnswer = (
  item: R8ItemNumber,
  answer: ConfirmedAnswer | undefined,
  yesValues: readonly string[] = ['yes']
): ApplicabilityResult => {
  if (!isConfirmed(answer) || answer.value === 'unknown' || answer.value === 'unanswered') {
    return {
      item,
      applicability: 'needs-review',
      reason: '研究責任者による回答の確認が必要',
      evidence: answer?.quote,
      guidancePending: true
    }
  }
  return {
    item,
    applicability: yesValues.includes(answer.value) ? 'required' : 'not-applicable',
    reason: '研究責任者が確認した回答に基づく判定',
    evidence: answer.quote,
    guidancePending: false
  }
}

export const assessConditionalR8Items = (inputs: ConditionalInputs): ApplicabilityResult[] => {
  const proxy = inputs.nodes['Q4d_代諾・アセント']
  const invasion = inputs.nodes['Q1a_侵襲']
  const intervention = inputs.nodes['Q1b_介入']
  return [
    fromConfirmedAnswer(16, proxy),
    fromConfirmedAnswer(17, proxy),
    fromConfirmedAnswer(18, inputs.checklist[18]),
    fromConfirmedAnswer(19, inputs.checklist[19]),
    fromConfirmedAnswer(20, invasion, ['yes', 'minor-invasion', '軽微な侵襲']),
    fromConfirmedAnswer(21, invasion, ['yes', 'minor-invasion', '軽微な侵襲']),
    fromConfirmedAnswer(22, inputs.checklist[22]),
    fromConfirmedAnswer(23, inputs.checklist[23]),
    fromConfirmedAnswer(24, inputs.checklist[24]),
    fromConfirmedAnswer(25, intervention)
  ]
}

export const R8_FINAL_DECISION_NOTICE =
  '最終的な判断は倫理審査委員会の意見を踏まえ研究機関の長が行います'

export const validateNotApplicable = (
  result: ApplicabilityResult,
  reason: string
): { valid: boolean; error?: 'reason-required' | 'required-item' } => {
  if (result.applicability === 'required') return { valid: false, error: 'required-item' }
  if (!reason.trim()) return { valid: false, error: 'reason-required' }
  return { valid: true }
}
