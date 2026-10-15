import { callable, LOCAL } from './definition'

export const contracts = {
  'writingSafeguards.getEthicsApproval': callable<
    (request: { projectId: string }) => Promise<{ approvalNumber: string }>
  >()('writing-safeguards', ['writing-safeguards:get-ethics-approval', LOCAL]),
  'writingSafeguards.setEthicsApproval': callable<
    (request: { projectId: string; approvalNumber: string }) => Promise<{ approvalNumber: string }>
  >()('writing-safeguards', ['writing-safeguards:set-ethics-approval', LOCAL])
} as const
