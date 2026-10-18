import { R8_RULESET_VERSION } from './r8-items'

export type AnswerSource = 'model_extracted' | 'physician_answered' | 'checklist_ticked'

export type AnswerRecord = {
  nodeId: string
  value: string
  answerSource: AnswerSource
  evidenceQuote: string | null
  confirmedBy: string | null
  confirmedAt: string | null
  ruleSetVersion: string
}

export type AuditedAnswer = AnswerRecord & {
  mayDetermineOutcome: boolean
  mustReask: boolean
  errors: readonly string[]
}

const uncertainValues = new Set(['不確定', '未回答', 'わからない'])

export const auditAnswerRecord = (record: AnswerRecord, scenario: string): AuditedAnswer => {
  const errors: string[] = []
  const quote = record.evidenceQuote?.trim() ?? ''

  if (record.answerSource === 'model_extracted') {
    if (!quote || !scenario.includes(quote)) errors.push('evidence-not-verbatim')
    if (!record.confirmedBy?.trim() || !record.confirmedAt?.trim())
      errors.push('confirmation-required')
  }
  if (record.ruleSetVersion !== R8_RULESET_VERSION) errors.push('rule-set-version-mismatch')

  const uncertain = uncertainValues.has(record.value)
  return {
    ...record,
    value: errors.includes('evidence-not-verbatim') ? '不確定' : record.value,
    mayDetermineOutcome: errors.length === 0 && !uncertain,
    mustReask: errors.length > 0 || uncertain,
    errors
  }
}
