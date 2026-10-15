// Deliverable packages (交付包) on the home entry. The three chat modes match
// resources/skills/research-deliverables. Statistician export is a fourth home
// card that writes aggregate files and does not start a chat workflow.

import { isMentorDiscussionPack } from '../../../../shared/deliverable-pack-policy'

export const DELIVERABLE_PACKAGE_IDS = ['mentor-pack', 'consultation-pack', 'writing-pack'] as const

export type DeliverablePackageId = (typeof DELIVERABLE_PACKAGE_IDS)[number]

export const HOME_DELIVERABLE_CARD_IDS = [
  'writing-pack',
  'consultation-pack',
  'mentor-pack',
  'statistician-export'
] as const

export type HomeDeliverableCardId = (typeof HOME_DELIVERABLE_CARD_IDS)[number]

export const isDeliverablePackage = (workflow: string): workflow is DeliverablePackageId =>
  (DELIVERABLE_PACKAGE_IDS as readonly string[]).includes(workflow)

type Translate = (key: string) => string

export type DeliverableCardCopy = {
  title: string
  subtitle: string
  description: string
  hardRule?: string
  inputNotice?: string
}

export const deliverableCardCopy = (
  t: Translate
): Record<HomeDeliverableCardId, DeliverableCardCopy> => ({
  'writing-pack': {
    title: t('Conference abstract or English draft'),
    subtitle: t('A short manuscript for a deadline, with checks for the ethics number and AI use.'),
    description: t(
      'This pack ends at a conference abstract or a short English draft. Continue a long paper from Manuscript writing or Academic English writing. Before writing, the ethics approval number is checked. A missing number is only a reminder and does not block writing.'
    )
  },
  'consultation-pack': {
    title: t('Data audit and statistical consultation pack'),
    subtitle: t(
      'Audit results, a statistical plan, and a consultation list to hand to a statistician.'
    ),
    description: t(
      'If you only need to run the tables yourself, use Data analysis. This pack organizes the problem before a consultation. The approval number is checked before a patient table is used or writing begins. A missing number is only a reminder.'
    )
  },
  'mentor-pack': {
    title: t('Mentor discussion pack'),
    subtitle: t('A one-page brief for a mentor meeting, focused on study-design consultation.'),
    description: t(
      'For discussion before ethics review: the research question, the design, and what to confirm with your mentor next. An approval number is not required. After ethics approval, use the data audit and statistical consultation pack when the discussion needs a table.'
    ),
    hardRule: t('This pack does not load patient data.'),
    inputNotice: t(
      'Do not paste individual patient data. Keep the consultation to the study design and a summary of aggregate results.'
    )
  },
  'statistician-export': {
    title: t('Aggregate statistics export'),
    subtitle: t('Aggregated results only; source data is not included'),
    description: t(
      'This does not run an analysis. It only exports the aggregate package for a statistician. Source data and chat history are not included.'
    )
  }
})

export const workflowRemindsEthicsApproval = (workflow: string): boolean =>
  workflow === 'manuscript' ||
  workflow === 'writing-pack' ||
  workflow === 'academic-english' ||
  workflow === 'consultation-pack'

export const mentorPackAgentInstruction = (t: Translate): string =>
  t(
    'This pack does not load patient data. Do not ask for patient tables or individual rows. Keep the consultation to study design and a summary of aggregate results.'
  )

export const mentorPackContext = (agentContext: string | null | undefined): boolean =>
  isMentorDiscussionPack(agentContext)

/**
 * Single hook for text a deliverable package would send to a model.
 *
 * TODO(phi-gate): PR #7 (https://github.com/chenglei1479-rgb/hph-health/pull/7)
 * adds `releaseModelText` / `restoreModelText` in `src/main/phi/gate.ts`. Once
 * that PR is merged, every outbound model call that carries a deliverable
 * prompt or package contents must pass the text through `releaseModelText`
 * before it leaves the machine, and model output must be restored with
 * `restoreModelText`. Do not import `src/main/phi/` until that change lands.
 * Today this returns the draft unchanged: the composer keeps it local, and the
 * conversation send path is the call that has to use the gate with `projectId`.
 */
export const guardDeliverableOutboundText = (text: string, projectId?: string): string => {
  void projectId
  return text
}

export const consultationPackExportPrompt = (t: (key: string) => string): string =>
  t(
    'Beta statistician export writes only a statistical report as Word or PDF, result tables as Excel with real counts and no masking under 10, a runnable R or Python script, and the variable definition table and execution log as PDF. Do not export raw data, Notebook outputs that contain individual rows, or chat history, and do not offer those options. A doctor confirms the de-identification check before export.'
  )
