export type ApprovalClaimMatch = { text: string; index: number }

const PROHIBITED = [
  /倫理(?:審査)?(?:は|が|に|を)?(?:通(?:る|ります|った|りました|っている|っています|っていた|っていました)|通過(?:できる|できます))/gu,
  /承認(?:される|されます|が得られます|される見込み)/gu,
  /このまま提出(?:できます|できる|可能|しても|してください|してよい|して良い)/gu,
  /審査に合格/gu,
  /必ず許可/gu,
  /(?:能|可以)通过伦理审查/gu,
  /(?:会|将会)被批准/gu,
  /保证通过/gu,
  /will be approved/giu,
  /pass(?:es)? the ethics review/giu,
  /ready (?:to submit|for submission)/giu,
  /submission-ready/giu,
  // §34.2 — high-impact fit / acceptance assurance (JA)
  /高インパクト(?:誌|ジャーナル)?(?:へ|に)?(?:の)?適合(?:し(?:ます|ている|ています)|する|できる|性が(?:高い|ある))/gu,
  /採択(?:可能性)?(?:が|は|を|の)?保証(?:します|しています|する|できる|される|されます)/gu,
  // §34.2 — novelty / clinical value / journal fit / ethics-pass (ZH-Hans)
  /具(?:有|备)(?:创新|新颖)性/gu,
  /创新性(?:高|显著|突出|强)/gu,
  /临床价值(?:高|显著|重大|突出|大)/gu,
  /具(?:有|备)(?:很高|较高|重大|显著|突出)的?临床价值/gu,
  /(?:符合|适合)(?:高分|高影响因子|高影響因子)期刊/gu,
  /伦理(?:审查)?(?:能|可以|会)?(?:通过|过)/gu
] as const

export const findProhibitedApprovalClaims = (text: string): ApprovalClaimMatch[] =>
  PROHIBITED.flatMap((pattern) =>
    [...text.matchAll(pattern)].map((match) => ({ text: match[0], index: match.index }))
  ).sort((left, right) => left.index - right.index)

export const hasProhibitedApprovalClaim = (text: string): boolean =>
  findProhibitedApprovalClaims(text).length > 0
