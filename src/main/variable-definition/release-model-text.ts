import { releaseModelText } from '../phi/gate'
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
 * Local redaction runs first so known patient marks become `[仮名化済み]`.
 * The production gate then scans the same string (`releaseModelText`).
 * Provider HTTP bodies are scanned again by `guardProviderBody` inside
 * `fetchProviderRequest`. Both the research plan and the model reply pass
 * through this hook before a model call, display, or template write.
 */
export const releaseVariableDefinitionText = async (
  text: string,
  projectId: string
): Promise<string> => {
  const released = await releaser(text, projectId)
  if (typeof released !== 'string') {
    throw new Error('Variable definition text was not released to the model.')
  }
  return releaseModelText(released, projectId)
}
