export const R8_RULESET_VERSION = 'r8-beta-0.1'

export type R8ItemNumber =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23
  | 24
  | 25

export type R8Item = {
  number: R8ItemNumber
  title: string
  required: boolean
  structureOnly: boolean
}

const item = (
  number: R8ItemNumber,
  title: string,
  required = number <= 15,
  structureOnly = false
): R8Item => ({ number, title, required, structureOnly })

export const R8_ITEMS = [
  item(1, 'Research title'),
  item(2, 'Research organization'),
  item(3, 'Purpose and significance'),
  item(4, 'Research methods and period'),
  item(5, 'Participant selection policy'),
  item(6, 'Scientific rationale'),
  item(7, 'Informed consent procedures'),
  item(8, 'Handling of personal information'),
  item(9, 'Burdens, risks, benefits, overall assessment, and minimization measures'),
  item(10, 'Storage and disposal of samples and information'),
  item(11, 'Reports to the head of the research institution'),
  item(12, 'Funding sources and conflicts of interest', true, true),
  item(13, 'Public disclosure of research information'),
  item(14, 'Handling of research results'),
  item(15, 'Consultation system and contact point, including genetic counseling'),
  item(16, 'Proxy consent'),
  item(17, 'Informed assent'),
  item(18, 'Emergency circumstances under Section 8-8', false, true),
  item(19, 'Financial burden or compensation'),
  item(20, 'Response to serious adverse events for invasive research', false, true),
  item(21, 'Compensation for health damage from invasive research', false, true),
  item(22, 'Medical care after the research', false, true),
  item(23, 'Outsourcing'),
  item(24, 'Future research use and provision to other institutions'),
  item(25, 'Monitoring and auditing', false, true)
] as const satisfies readonly R8Item[]

export const R8_COLLECTION_ONLY_NOTICE = '試料・情報の収集・提供（指針第7⑵）は β では未対応です'
