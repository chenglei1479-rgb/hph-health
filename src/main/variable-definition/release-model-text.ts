import { redactPatientPhi } from './patient-phi'

export type VariableDefinitionTextReleaser = (
  text: string,
  projectId: string
) => Promise<string> | string

let releaser: VariableDefinitionTextReleaser = (text) => redactPatientPhi(text)

export const installVariableDefinitionTextReleaser = (
  next: VariableDefinitionTextReleaser | null
): void => {
  releaser = next ?? ((text) => redactPatientPhi(text))
}

/**
 * TODO(phi-gate): PR #7 (https://github.com/chenglei1479-rgb/hph-health/pull/7)
 * adds `releaseModelText` and the `gate` object in `src/main/phi/gate.ts`.
 * Replace the body of `releaser` with `(text, projectId) => releaseModelText(text, projectId)`
 * once that file is on main. Do not import `src/main/phi/gate` until then.
 * Both the research plan and the model reply pass through this hook. Neither
 * is patient-table data; the hook still strips identifiers before a model call
 * or before a reply is shown or written into the template.
 */
export const releaseVariableDefinitionText = async (
  text: string,
  projectId: string
): Promise<string> => {
  const released = await releaser(text, projectId)
  if (typeof released !== 'string') {
    throw new Error('Variable definition text was not released to the model.')
  }
  return released
}
