// Conclusion check for the writing stage.
//
// Enabled by default. Disable it without a code change by setting
// DRA_CONCLUSION_CHECK=0 (also accepted: false, off, no, disabled).
//
// The check only flags sentences. It never returns a rewrite.

export const CONCLUSION_CHECK_ENV = 'DRA_CONCLUSION_CHECK'

const DISABLED = new Set(['0', 'false', 'off', 'no', 'disabled'])

export type ConclusionFlagKind =
  'correlation-as-causation' | 'effect-without-significance' | 'extrapolation-beyond-population'

export type ConclusionFlag = {
  kind: ConclusionFlagKind
  sentence: string
  evidence: string
}

export type ConclusionCheckResult = {
  flags: ConclusionFlag[]
  rewritten: false
}

export type NotebookEvidence = {
  results: string
  limitations: string
}

const REASONS: Record<ConclusionFlagKind, string> = {
  'correlation-as-causation':
    '結論が相関を因果として述べています。Notebookの結果または限界は因果を示していません。文は書き換えていません。',
  'effect-without-significance':
    '結論が有意差の裏付けのない効果を述べています。Notebookの結果は有意ではありません。文は書き換えていません。',
  'extrapolation-beyond-population':
    '結論が研究対象を超えて外挿しています。Notebookの限界または対象と一致しません。文は書き換えていません。'
}

export const conclusionCheckEnabled = (
  env: Record<string, string | undefined> = process.env
): boolean => {
  const raw = env[CONCLUSION_CHECK_ENV]
  if (raw === undefined || raw.trim() === '') return true
  return !DISABLED.has(raw.trim().toLowerCase())
}

const splitSentences = (text: string): string[] =>
  text
    .split(/(?<=[。！？.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)

const CAUSAL =
  /引き起こ|原因である|が原因とな|を原因として|caused|causes|leads to|led to|resulted in/i
const ASSOCIATION =
  /相関|関連がみ|関連が|関連して|associated with|correlation|association|因果関係は示せ|因果は示せ|因果関係は不明|cannot infer caus|does not establish caus|not causal/i
const NEGATED_EFFECT =
  /有意差はな|有意ではな|有意でない|not significant|no significant|did not|なかった|認めなかった/i
const ESTABLISHED_EFFECT =
  /有意|significant|効果があった|効果を認め|改善した|低下させ|上昇させ|減少した|増加した|低下した|上昇した|reduced|increased|improved|was effective/i
const SIGNIFICANCE_WORD = /有意|significant/i
const ABSENT_PHRASE = /有意差はな|有意ではな|有意でない|not significant|n\.s\.|非有意/i
const PRESENT_PHRASE = /有意差を認め|有意であった|statistically significant/i
const CANNOT_GENERALIZE =
  /一般化できな|外挿できな|cannot be generalized|should not be generalized|not generalizable|limited to the study population/i
const GENERALIZE_CLAIM =
  /一般化できる|広く適用|all patients|すべての患者|全ての患者|the general population|一般人口/i

const POPULATION_CONTRASTS: ReadonlyArray<{ study: RegExp; broader: RegExp }> = [
  { study: /成人|adults?/i, broader: /小児|子ども|children|pediatric/i },
  {
    study: /肺癌|lung cancer/i,
    broader: /すべてのがん|全てのがん|all cancers|他の癌|other cancers/i
  },
  {
    study: /単一?施設|single[- ]cent(?:er|re)|one hospital/i,
    broader: /全国|nationwide|多施設のすべて|all hospitals/i
  }
]

const claimsCausal = (sentence: string): boolean =>
  CAUSAL.test(sentence) && !/関連|相関|associated|correlation/i.test(sentence)

const claimsEstablishedEffect = (sentence: string): boolean =>
  !NEGATED_EFFECT.test(sentence) && ESTABLISHED_EFFECT.test(sentence)

const claimsSignificance = (sentence: string): boolean =>
  !NEGATED_EFFECT.test(sentence) && SIGNIFICANCE_WORD.test(sentence)

type Significance = 'present' | 'absent' | 'unknown'

const significanceState = (notebook: string): Significance => {
  let present = PRESENT_PHRASE.test(notebook)
  let absent = ABSENT_PHRASE.test(notebook)
  for (const match of notebook.matchAll(/p\s*([<=>＜＞＝])\s*(0?\.\d+)/gi)) {
    const raw = match[1] ?? '='
    const op = raw === '<' || raw === '＜' ? '<' : raw === '>' || raw === '＞' ? '>' : '='
    const value = Number(match[2])
    if (!Number.isFinite(value)) continue
    if (op === '<' && value <= 0.05) present = true
    else if ((op === '=' || op === '>') && value < 0.05) present = true
    else if (value >= 0.05) absent = true
  }
  if (present && !absent) return 'present'
  if (absent && !present) return 'absent'
  if (present) return 'present'
  return 'unknown'
}

const extrapolates = (sentence: string, study: string): boolean => {
  if (CANNOT_GENERALIZE.test(study) && GENERALIZE_CLAIM.test(sentence)) return true
  return POPULATION_CONTRASTS.some(
    (contrast) => contrast.study.test(study) && contrast.broader.test(sentence)
  )
}

const flag = (kind: ConclusionFlagKind, sentence: string): ConclusionFlag => ({
  kind,
  sentence,
  evidence: REASONS[kind]
})

export const flagConclusions = (input: {
  conclusions: string
  notebook: NotebookEvidence
  enabled?: boolean
}): ConclusionCheckResult => {
  if (input.enabled === false) return { flags: [], rewritten: false }
  const study = `${input.notebook.results}\n${input.notebook.limitations}`
  if (study.trim().length === 0) return { flags: [], rewritten: false }
  const significance = significanceState(study)
  const associationOnly = ASSOCIATION.test(study)
  const flags: ConclusionFlag[] = []
  let sawCausation = false
  let sawEffect = false
  let sawExtrapolation = false
  for (const sentence of splitSentences(input.conclusions)) {
    if (!sawCausation && claimsCausal(sentence) && associationOnly) {
      flags.push(flag('correlation-as-causation', sentence))
      sawCausation = true
    }
    if (
      !sawEffect &&
      claimsEstablishedEffect(sentence) &&
      (significance === 'absent' || (significance === 'unknown' && claimsSignificance(sentence)))
    ) {
      flags.push(flag('effect-without-significance', sentence))
      sawEffect = true
    }
    if (!sawExtrapolation && extrapolates(sentence, study)) {
      flags.push(flag('extrapolation-beyond-population', sentence))
      sawExtrapolation = true
    }
  }
  return { flags, rewritten: false }
}
