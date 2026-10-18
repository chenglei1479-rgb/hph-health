import { detectPhi, type PhiSpan } from '../../phi/detect'
import { assertModelBoundTextReleased, PhiGateError } from '../../phi/gate'

// detectPhi treats an entire short Japanese string as a personal name. Aggregate labels such as
// 男性 / 内科 are that shape. The connector query gate ignores only that whole-string guess;
// labeled names and structured identifiers still go through guardProviderBody → releaseModelText.
const NAME_GUESS_MARK = /患者|氏名|さん|Pt:|キーパーソン|長男|長女|娘の/

const isWholeStringNameGuess = (text: string, span: PhiSpan): boolean => {
  if (span.category !== 'PERSON_NAME' && span.category !== 'PHYSICIAN_NAME') return false
  if (span.text !== text.trim()) return false
  return !NAME_GUESS_MARK.test(text)
}

export const hasReleasablePatientPhi = (text: string): boolean =>
  detectPhi(text).some((span) => !isWholeStringNameGuess(text, span))

export const PHI_OUTPUT_BLOCK_MESSAGE =
  '患者情報が含まれるため、この出力はモデルに渡しません。個人情報を除いた集計だけを出力してください。'

/**
 * Full provider PHI gate for one string already known to contain patient PHI.
 * `guardProviderBody` scans non-JSON text with `releaseModelText` (detectPhi + deidentify).
 * A refused send becomes `onRefuse` and never echoes the original spans.
 */
export const releaseTextThroughPhiGate = async (
  text: string,
  projectId: string,
  onRefuse: string
): Promise<string> => {
  try {
    const released = await assertModelBoundTextReleased(text, projectId)
    if (hasReleasablePatientPhi(text) && released === text) return onRefuse
    return released
  } catch (error) {
    // A detected-patient refusal can return a fixed message. Infrastructure/review failures
    // (including timeouts) stop the enclosing send instead of being converted into output.
    if (error instanceof PhiGateError && error.spans.length > 0) return onRefuse
    throw error
  }
}
