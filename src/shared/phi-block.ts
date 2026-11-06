// Stable identifier for a request the PHI gate refused before it left the machine. The doctor-facing
// sentence carries it, and the main-process log records it together with span categories and offsets
// only — never the matched patient text.
export const PHI_BLOCK_CODE = 'PHI-BLOCK-01'

// A request the gate refused locally. The request is invalid, not the upstream unavailable, so a
// transport that answers HTTP for it must say 400: beta.21 answered 502, which the agent CLI read as a
// transient gateway failure and retried 30 times in 25.5 s for a decision that could never change (#159).
export class PhiPolicyError extends Error {}
