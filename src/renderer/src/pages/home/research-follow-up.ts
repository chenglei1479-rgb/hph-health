import { WORKFLOW_MODE_ANALYSIS_LINE } from '../../../../shared/deliverable-next-step'
import { guardDeliverableOutboundText } from './deliverable-packages'

type Translate = (key: string, options?: Record<string, string>) => string

// Continues in the current project. The mode line is stable ASCII so the next
// recommendation can see which step finished, in any UI language.
export const buildResearchFollowUpPrompt = (
  t: Translate,
  workflow: 'analysis' | 'writing-pack',
  theme: string
): string => {
  const startingPoint =
    workflow === 'analysis' ? t('Data analysis') : t('Conference abstract or English draft')
  const core = t(
    'Start a reviewable medical research workflow for “{{theme}}”, beginning with {{startingPoint}}. Show the first stage as an editable draft, identify the evidence or data needed, and ask the researcher to confirm or revise it before proceeding. Respond in the app’s selected language.',
    { theme, startingPoint }
  )
  if (workflow === 'analysis') {
    return `${core}\n\n${t('For data analysis, ask the researcher to attach an anonymized CSV if none is attached. Preserve the original and stop if direct identifiers or likely patient identifiers are found; do not reproduce them. First provide a reviewable data profile: row and column counts, schema, variable names and types, units, coding, duplicates, ranges, missingness by variable, and appropriate descriptive statistics. Explain limitations and any data-quality decisions. Recommend a statistical plan based on the design, outcomes, distributions, sample size, and missingness; state assumptions, alternatives, effect measures, and missing-data handling. Propose Table 1 and figure specifications. Then stop and wait for explicit researcher approval of the plan. Only after approval run Python or R. Provide the exact reproducible code, software and package versions, input-file checksum, parameters, and generated tables and figures. Report only computed results with effect sizes and uncertainty, then draft Methods and Results from those outputs and request researcher review. If the environment cannot execute an analysis or generate an artifact, say so and provide the code as a draft instead of claiming completion.')}\n${WORKFLOW_MODE_ANALYSIS_LINE}`
  }
  const pack = guardDeliverableOutboundText(
    `${t('Load the research-deliverables skill for {{researchPackage}}. Confirm required inputs and the output checklist before starting. Mark missing evidence and unexecuted analyses explicitly.', { researchPackage: startingPoint })}\nPackage mode: writing-pack`
  )
  return `${core}\n\n${pack}`
}
