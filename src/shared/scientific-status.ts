import { z } from 'zod'

export const SCIENTIFIC_STATUSES = [
  'not-executed',
  'computed',
  'needs-review',
  'data-blocked'
] as const
export type ScientificStatus = (typeof SCIENTIFIC_STATUSES)[number]
export const scientificItemSchema = z
  .object({
    id: z.string().min(1).max(128),
    title: z.string().trim().min(1).max(120),
    status: z.enum(SCIENTIFIC_STATUSES),
    evidence: z.string().max(2000),
    dataCondition: z.string().max(2000),
    nextStep: z.string().max(2000),
    outputsChecked: z.boolean()
  })
  .strict()
  .superRefine((item, ctx) => {
    if (item.status === 'computed' && (!item.evidence.trim() || !item.outputsChecked))
      ctx.addIssue({ code: 'custom', message: 'computed-needs-checked-output-evidence' })
    if (item.status === 'needs-review' && !item.evidence.trim())
      ctx.addIssue({ code: 'custom', message: 'review-needs-material' })
    if (item.status === 'data-blocked' && !item.dataCondition.trim())
      ctx.addIssue({ code: 'custom', message: 'data-blocked-needs-condition' })
  })
export type ScientificItem = z.infer<typeof scientificItemSchema>
export const scientificRecordSchema = z
  .object({
    version: z.literal(1),
    projectId: z.string().min(1).max(256),
    items: z.array(scientificItemSchema).max(20),
    updatedAt: z.number().finite().nonnegative()
  })
  .strict()
  .refine((record) => new Set(record.items.map((item) => item.id)).size === record.items.length)
export type ScientificRecord = z.infer<typeof scientificRecordSchema>
export const scientificStatusKey = (projectId: string): string =>
  `dra-scientific-status-v1:${encodeURIComponent(projectId)}`
export const newScientificItem = (id: string, title: string): ScientificItem => ({
  id,
  title,
  status: 'not-executed',
  evidence: '',
  dataCondition: '',
  nextStep: '',
  outputsChecked: false
})

// These are explicit researcher records, never inferred from chat text or a model Run ending.
export const readScientificRecord = (
  storage: Pick<Storage, 'getItem'>,
  projectId: string
): ScientificRecord | undefined => {
  const raw = storage.getItem(scientificStatusKey(projectId))
  if (raw === null) return undefined
  const record = scientificRecordSchema.parse(JSON.parse(raw))
  if (record.projectId !== projectId)
    throw new Error('Scientific record belongs to another project')
  return record
}
export const saveScientificRecord = (
  storage: Pick<Storage, 'setItem'>,
  record: ScientificRecord
): void => {
  const validated = scientificRecordSchema.parse(record)
  storage.setItem(scientificStatusKey(validated.projectId), JSON.stringify(validated))
}
