// Stable markers written into a project's agent context. They are not UI copy:
// the home screen translates pack titles, and these lines only identify the pack.

export const MENTOR_PACK_MODE_LINE = 'Package mode: mentor-pack'

export const CONSULTATION_PACK_MODE_LINE = 'Package mode: consultation-pack'

export const isMentorDiscussionPack = (agentContext: string | null | undefined): boolean =>
  (agentContext ?? '').includes(MENTOR_PACK_MODE_LINE)

export const isConsultationPack = (agentContext: string | null | undefined): boolean =>
  (agentContext ?? '').includes(CONSULTATION_PACK_MODE_LINE)

export const MENTOR_PACK_TABLE_REFUSAL = 'This pack does not load patient data.'
