// Stable identifier for a request the PHI gate refused before it left the machine. The doctor-facing
// sentence carries it, and the main-process log records it together with span categories and offsets
// only — never the matched patient text.
export const PHI_BLOCK_CODE = 'PHI-BLOCK-01'
