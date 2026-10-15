// Project-level ethics approval number. An empty value reminds the doctor
// before writing and never blocks the writing stage.

export const ETHICS_APPROVAL_MAX_LENGTH = 80

export const ETHICS_WRITING_REMINDER =
  '倫理審査の承認番号が未入力です。執筆は続けられます。番号が分かり次第、プロジェクトに記録してください。'

export type EthicsWritingReminder = {
  blocking: false
  show: boolean
  message: string
}

export const normalizeEthicsApprovalNumber = (value: string): string =>
  value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, ETHICS_APPROVAL_MAX_LENGTH)

export const ethicsWritingReminder = (
  approvalNumber: string | undefined | null
): EthicsWritingReminder => {
  const show = normalizeEthicsApprovalNumber(approvalNumber ?? '').length === 0
  return {
    blocking: false,
    show,
    message: show ? ETHICS_WRITING_REMINDER : ''
  }
}
