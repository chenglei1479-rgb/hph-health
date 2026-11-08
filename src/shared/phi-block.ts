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
//   E  an internal invariant of the gate broke            -> 409, retrying cannot change it
//
// E is 409, not 500, for a concrete reason: the client retries 5xx, and an E raised after a review (the
// date-shift collision in store.ts) would replay the whole gate and can reopen the consent window that
// D exists to stop reopening. 409 says "this request conflicts with the state we are in", sits outside
// the client's retry set, and makes no claim that the content was patient information.
export const PHI_UNSCANNABLE_CODE = 'PHI-UNSCANNABLE-01'
export const PHI_UNAVAILABLE_CODE = 'PHI-UNAVAILABLE-01'
export const PHI_CONSENT_CODE = 'PHI-CONSENT-01'
// E with its own id: the privacy check needs a human review surface that this build/runtime has not
// wired up. `installPhiConfirmer` only runs during composition, so the same process cannot recover from
// this - 503 would claim "later will be better" and be lying, the same judgement we refuse for an
// unmapped code. The wiring gap is made countable in the log instead
// (`reason=bridge-has-no-review-surface`).
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

// The transport derives its statuses from these two lists, so it cannot restate them. Both are outside
// the client's retry set; they differ in what they say about the request.
export const PHI_CLIENT_REFUSAL_CODES: readonly PhiFailureCode[] = [
  PHI_BLOCK_CODE,
  PHI_UNSCANNABLE_CODE,
  PHI_CONSENT_CODE,
  PHI_TURN_REPLACED_CODE
]
export const PHI_UNRETRYABLE_INTERNAL_CODES: readonly PhiFailureCode[] = [
  PHI_INTERNAL_CODE,
  PHI_REVIEW_UNAVAILABLE_CODE
]
