export interface MachineApprovalStatus {
  approved: boolean
  approvalNumber: string | null
  at: string | null
}

export interface SetMachineApprovalRequest {
  approved: boolean
  approvalNumber?: string
}
