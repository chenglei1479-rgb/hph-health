// Stable identifier for a request the PHI gate refused before it left the machine. The doctor-facing
// sentence carries it, and the main-process log records it together with span categories and offsets
// only — never the matched patient text.
export const PHI_BLOCK_CODE = 'PHI-BLOCK-01'

// Logged when replacements inside application-owned prompt text are released without being shown to the
// reviewer (#160). The confirmation window never opens for that case, so this line is the only trace a
// support engineer has: stable id plus counts and categories, never the replaced text.
export const PHI_REVIEW_EXCLUDED_CODE = 'PHI-REVIEW-SKIP-01'

// A request the gate refused locally. The request is invalid, not the upstream unavailable, so a
// transport that answers HTTP for it must say 400: beta.21 answered 502, which the agent CLI read as a
// transient gateway failure and retried 30 times in 25.5 s for a decision that could never change (#159).
export class PhiPolicyError extends Error {}
