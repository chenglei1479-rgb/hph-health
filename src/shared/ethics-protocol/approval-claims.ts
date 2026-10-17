export type ApprovalClaimMatch = { text: string; index: number }

const PROHIBITED = [
  /倫理審査(?:に(?:通る|通ります)|を通過できます)/gu,
  /承認(?:される|されます|が得られます|される見込み)/gu,
  /このまま提出できます/gu,
  /審査に合格/gu,
  /必ず許可/gu,
  /(?:能|可以)通过伦理审查/gu,
  /(?:会|将会)被批准/gu,
  /保证通过/gu,
  /will be approved/giu,
  /pass(?:es)? the ethics review/giu,
  /ready to submit/giu
] as const

export const findProhibitedApprovalClaims = (text: string): ApprovalClaimMatch[] =>
  PROHIBITED.flatMap((pattern) =>
    [...text.matchAll(pattern)].map((match) => ({ text: match[0], index: match.index }))
  ).sort((left, right) => left.index - right.index)

export const hasProhibitedApprovalClaim = (text: string): boolean =>
  findProhibitedApprovalClaims(text).length > 0
