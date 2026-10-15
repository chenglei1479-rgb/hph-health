import type { GatedNotebookOutput } from '../../../shared/schema-notebook'
import { PHI_OUTPUT_BLOCK_MESSAGE, releaseTextThroughPhiGate } from './notebook-phi-release'
import { notebookOutputContainsPatientRows, PATIENT_ROW_BLOCK_MESSAGE } from './patient-row-output'
import { redactPatientPhi } from './patient-phi'
import { suppressSmallAggregateText } from './small-cell'

export type NotebookModelTextReleaser = (
  text: string,
  projectId: string
) => Promise<string> | string

const releaseThroughPhiGate: NotebookModelTextReleaser = async (text, projectId) => {
  const redacted = redactPatientPhi(text)
  return releaseTextThroughPhiGate(redacted, projectId, PHI_OUTPUT_BLOCK_MESSAGE)
}

let releaser: NotebookModelTextReleaser = releaseThroughPhiGate

/**
 * Install the outbound releaser used before Notebook text can reach a model.
 * Tests use this to observe the gate. Production local-redacts, then runs
 * `guardProviderBody` (detectPhi / releaseModelText) for anything still marked
 * as patient PHI. Row-level output is refused before either step.
 */
export const installNotebookModelTextReleaser = (next: NotebookModelTextReleaser | null): void => {
  releaser = next ?? releaseThroughPhiGate
}

/**
 * Local redaction turns known labeled patient marks into `[仮名化済み]`.
 * The provider gate then scans the same string. Small-count suppression stays
 * after the gate, and only for text that was not refused.
 */
export const releaseNotebookModelText = async (
  text: string,
  projectId: string
): Promise<string> => {
  if (notebookOutputContainsPatientRows(text)) return PATIENT_ROW_BLOCK_MESSAGE
  const released = await releaser(text, projectId)
  if (typeof released !== 'string') {
    throw new Error('Notebook output was not released to the model.')
  }
  return suppressSmallAggregateText(released)
}

const gateField = async (
  value: string | undefined,
  projectId: string
): Promise<string | undefined> =>
  value === undefined ? undefined : releaseNotebookModelText(value, projectId)

/** Every channel that can be shown back to a model goes through the gate. */
export const gateNotebookOutputs = async (
  output: GatedNotebookOutput,
  projectId: string
): Promise<GatedNotebookOutput> => {
  const [error, stdout, head, table] = await Promise.all([
    gateField(output.error, projectId),
    gateField(output.stdout, projectId),
    gateField(output.head, projectId),
    gateField(output.table, projectId)
  ])
  return {
    ...(error === undefined ? {} : { error }),
    ...(stdout === undefined ? {} : { stdout }),
    ...(head === undefined ? {} : { head }),
    ...(table === undefined ? {} : { table })
  }
}
