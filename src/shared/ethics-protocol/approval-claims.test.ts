import { describe, expect, it } from 'vitest'

import { hasProhibitedApprovalClaim } from './approval-claims'

const prohibited = [
  'この計画なら倫理審査に通る。',
  '倫理審査に通ります。',
  '倫理審査を通過できます。',
  '委員会で承認される。',
  'この内容は承認されます。',
  '承認が得られます。',
  '承認される見込みです。',
  'このまま提出できます。',
  '審査に合格します。',
  '必ず許可されます。',
  '该方案能通过伦理审查。',
  '该方案可以通过伦理审查。',
  '这项研究会被批准。',
  '这项研究将会被批准。',
  '我们保证通过。',
  '保证通过伦理委员会审查。',
  '材料已经能通过伦理审查。',
  '申请会被批准。',
  'This protocol will be approved.',
  'It will be approved by the committee.',
  'This protocol passes the ethics review.',
  'The protocol will pass the ethics review.',
  'The application is ready to submit.',
  'This draft is ready to submit.',
  'We guarantee it will be approved.',
  'The revised plan passes the ethics review.',
  '提出前でも倫理審査に通ります。',
  '修正なしで承認される見込みです。',
  '这个版本保证通过。',
  'The document will be approved tomorrow.',
  // §34.2 — high-impact fit / acceptance assurance (JA)
  '高インパクト誌に適合します。',
  'この研究は高インパクト誌への適合性が高い。',
  '高インパクトジャーナルに適合する内容です。',
  '本論文は採択を保証します。',
  '採択可能性を保証しています。',
  '採択が保証されます。',
  'この研究は倫理に通ります。',
  '倫理審査は通ります。',
  '倫理は通っています。',
  'このまま提出しても大丈夫です。',
  'このまま提出可能です。',
  // §34.2 — novelty / clinical value / journal fit / ethics-pass (ZH-Hans)
  '本研究具有创新性。',
  '该方案具备新颖性。',
  '创新性高，适合发表。',
  '本研究的创新性显著。',
  '本研究临床价值高。',
  '具有很高的临床价值。',
  '具有重大临床价值。',
  '本研究符合高分期刊。',
  '符合高影响因子期刊的要求。',
  '适合高分期刊发表。',
  '本研究伦理能过。',
  '伦理审查能通过。',
  '伦理可以通过。',
  // §34.2 — submission readiness (EN)
  'The manuscript is ready for submission.',
  'This paper is submission-ready.'
]

const allowed = [
  '倫理審査委員会の意見を聴いた上で研究機関の長の許可を受けた後に研究を開始する。',
  '倫理審査委員会へ提出する前に研究者が内容を確認する。',
  '承認の可否は委員会が判断する。',
  '本書は審査用の草案である。',
  '機関の規程を確認する必要がある。',
  '经伦理审查委员会审议后，由研究机构负责人作出决定。',
  '提交前请研究者自行确认。',
  '本文件是未完成的草案。',
  '是否批准由伦理委员会判断。',
  '请遵守所属机构的规定。',
  'The committee will decide whether to approve the study.',
  'Review the draft before submission.',
  'Approval must be obtained before the study begins.',
  'This is an incomplete draft.',
  'Follow the requirements of the institution and ethics committee.'
]

describe('approval claim guard', () => {
  it.each(prohibited)('blocks prohibited assurance: %s', (text) => {
    expect(hasProhibitedApprovalClaim(text)).toBe(true)
  })

  it.each(allowed)('allows procedural language: %s', (text) => {
    expect(hasProhibitedApprovalClaim(text)).toBe(false)
  })
})
