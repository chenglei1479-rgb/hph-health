import type { GatedNotebookOutput } from '../../../shared/schema-notebook'
import { redactPatientPhi } from './patient-phi'
import { suppressSmallAggregateText } from './small-cell'

export type NotebookModelTextReleaser = (
  text: string,
  projectId: string
) => Promise<string> | string

let releaser: NotebookModelTextReleaser = (text) => redactPatientPhi(text)

/**
 * Install the outbound releaser used before Notebook text can reach a model.
 * Tests use this to observe the gate. Production keeps the local redactor
 * until PR #7 is merged.
 */
export const installNotebookModelTextReleaser = (next: NotebookModelTextReleaser | null): void => {
  releaser = next ?? ((text) => redactPatientPhi(text))
}

/**
 * TODO(phi-gate): PR #7 (https://github.com/chenglei1479-rgb/hph-health/pull/7)
 * adds `releaseModelText` and the `gate` object in `src/main/phi/gate.ts`.
 * Replace the body of `releaser` with `(text, projectId) => releaseModelText(text, projectId)`
 * once that file is on main. Do not import `src/main/phi/gate` until then.
 * Small-count suppression stays here, after the gate returns.
 */
export const releaseNotebookModelText = async (
  text: string,
  projectId: string
): Promise<string> => {
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
