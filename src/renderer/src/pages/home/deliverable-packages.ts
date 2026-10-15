// Deliverable packages (交付包) restored on the home entry flow as step 2,
// after project setup. The three modes match resources/skills/research-deliverables.

export const DELIVERABLE_PACKAGE_IDS = ['mentor-pack', 'consultation-pack', 'writing-pack'] as const

export type DeliverablePackageId = (typeof DELIVERABLE_PACKAGE_IDS)[number]

export const isDeliverablePackage = (workflow: string): workflow is DeliverablePackageId =>
  (DELIVERABLE_PACKAGE_IDS as readonly string[]).includes(workflow)

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
