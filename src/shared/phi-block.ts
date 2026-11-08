// Stable identifiers for a request the PHI gate refused before it left the machine. The code is what
// a support engineer counts and what the transport maps to a status; the doctor-facing sentence never
// carries matched patient text or a local path.
export const PHI_BLOCK_CODE = 'PHI-BLOCK-01'

// Logged when replacements inside application-owned prompt text are released without being shown to the
// reviewer (#160). The confirmation window never opens for that case, so this line is the only trace a
// support engineer has: stable id plus counts and categories, never the replaced text.
export const PHI_REVIEW_EXCLUDED_CODE = 'PHI-REVIEW-SKIP-01'

// #195: refusal classes are decided where the error is minted, not in the HTTP layer. The question each
// code answers is "would resending the same request produce a different answer?" - not "what should the
// doctor read".
//
//   A  patient information was found                     -> 400, never retried
//   B  this request can never be checked as text          -> 400, never retried
//   C1 the policy engine is temporarily unavailable       -> 503, retry may succeed
//   D  a human consent step is missing, stale or refused  -> 400, the machine must not decide it
//   E  an internal invariant of the gate broke            -> 500, retrying proves nothing
export const PHI_UNSCANNABLE_CODE = 'PHI-UNSCANNABLE-01'
export const PHI_UNAVAILABLE_CODE = 'PHI-UNAVAILABLE-01'
export const PHI_CONSENT_CODE = 'PHI-CONSENT-01'
// C1 with its own id: the privacy check needs a human review surface that this build/runtime has not
// wired up. Retrying is harmless and may recover once the bridge is installed, but the wiring gap must
// be countable in the log (`reason=bridge-has-no-review-surface`), not only felt as retries.
export const PHI_REVIEW_UNAVAILABLE_CODE = 'PHI-REVIEW-UNAVAILABLE-01'
// A superseded turn is consent-shaped (a human decision already moved on) but must not reuse the
// privacy-review wording: nothing was wrong with the content, the turn itself is stale.
export const PHI_TURN_REPLACED_CODE = 'PHI-TURN-REPLACED-01'
export const PHI_INTERNAL_CODE = 'PHI-INTERNAL-01'

export type PhiFailureCode =
  | typeof PHI_BLOCK_CODE
  | typeof PHI_UNSCANNABLE_CODE
  | typeof PHI_UNAVAILABLE_CODE
  | typeof PHI_REVIEW_UNAVAILABLE_CODE
  | typeof PHI_CONSENT_CODE
  | typeof PHI_TURN_REPLACED_CODE
  | typeof PHI_INTERNAL_CODE

// A request the gate refused locally. The request is invalid, not the upstream unavailable, so a
// transport that answers HTTP for it must say 400: beta.21 answered 502, which the agent CLI read as a
// transient gateway failure and retried 30 times in 25.5 s for a decision that could never change (#159).
//
// Only a classified error with a doctor-facing message should reach this class. An implementation that
// fails internally (a vault that cannot decrypt, a de-identification collision) throws this type too, so
// the gate can keep its class and log the stable code; the message on such an error is diagnostic and
// must be replaced before anything is shown to a person.
export class PhiPolicyError extends Error {
  readonly code: PhiFailureCode

  constructor(message = '', code: PhiFailureCode = PHI_INTERNAL_CODE) {
    super(message)
    this.code = code
    this.name = 'PhiPolicyError'
  }
}

// The subset the client must not retry. Kept here so the transport and the gate agree on one list.
export const PHI_CLIENT_REFUSAL_CODES: readonly PhiFailureCode[] = [
  PHI_BLOCK_CODE,
  PHI_UNSCANNABLE_CODE,
  PHI_CONSENT_CODE,
  PHI_TURN_REPLACED_CODE
]
