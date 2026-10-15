import { copyForLocale } from '../copy-locale'
import type { Locale } from '../locale'

// Project-level ethics approval number. An empty value reminds the doctor
// before writing and never blocks the writing stage.

export const ETHICS_APPROVAL_MAX_LENGTH = 80

export const ETHICS_WRITING_REMINDER =
  '倫理審査の承認番号が未入力です。執筆は続けられます。番号が分かり次第、プロジェクトに記録してください。'

const REMINDERS = {
  en: 'The ethics approval number is missing. You can continue writing. Record the number on the project when you have it.',
  'zh-Hans': '尚未填写伦理审查批准号。可以继续撰写。获知编号后，请记入项目。',
  'zh-Hant': '尚未填寫倫理審查核准編號。可以繼續撰寫。得知編號後，請記入專案。',
  ja: ETHICS_WRITING_REMINDER,
  ko: '윤리심사 승인 번호가 비어 있습니다. 집필은 계속할 수 있습니다. 번호를 알게 되면 프로젝트에 기록하십시오.',
  fr: 'Le numéro d’approbation éthique n’est pas renseigné. Vous pouvez poursuivre la rédaction. Enregistrez le numéro dans le projet dès que vous l’aurez.',
  ru: 'Номер одобрения этического комитета не указан. Написание можно продолжить. Запишите номер в проекте, когда он станет известен.',
  de: 'Die Genehmigungsnummer der Ethikkommission fehlt. Sie können mit dem Schreiben fortfahren. Tragen Sie die Nummer im Projekt ein, sobald sie vorliegt.',
  es: 'Falta el número de aprobación ética. Puede continuar la redacción. Registre el número en el proyecto cuando lo tenga.'
} satisfies Record<Locale, string>

export type EthicsWritingReminder = {
  blocking: false
  show: boolean
  message: string
}

const isEthicsApprovalControl = (char: string): boolean => {
  const code = char.charCodeAt(0)
  return code <= 0x1f || code === 0x7f
}

export const normalizeEthicsApprovalNumber = (value: string): string =>
  [...value]
    .filter((char) => !isEthicsApprovalControl(char))
    .join('')
    .trim()
    .slice(0, ETHICS_APPROVAL_MAX_LENGTH)

export const ethicsWritingReminder = (
  approvalNumber: string | undefined | null,
  language?: string
): EthicsWritingReminder => {
  const show = normalizeEthicsApprovalNumber(approvalNumber ?? '').length === 0
  return {
    blocking: false,
    show,
    message: show ? copyForLocale(REMINDERS, language) : ''
  }
}
