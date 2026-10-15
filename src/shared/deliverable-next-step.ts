// Next deliverable after a pack the app can already run.
// Unreleased cards are the only place a missing destination may appear.
// Flip this one flag to drop every unreleased card. Available steps stay.

export const SHOW_UNRELEASED_PACK_PLACEHOLDERS = true

export const WORKFLOW_MODE_ANALYSIS_LINE = 'Workflow mode: analysis'

export const DELIVERY_PACK_IDS = [
  'mentor-pack',
  'consultation-pack',
  'writing-pack',
  'statistician-export',
  'analysis'
] as const

export type DeliveryPackId = (typeof DELIVERY_PACK_IDS)[number]

export type NextStepRecommendation =
  | { kind: 'available'; id: 'analysis' | 'writing-pack' }
  | { kind: 'unreleased'; id: 'ethics-application' | 'slides-poster' }

const PACKAGE_MODE = /Package mode: (mentor-pack|consultation-pack|writing-pack)/g
const ANALYSIS_MODE = /Workflow mode: analysis/g

export const isDeliveryPackId = (value: string): value is DeliveryPackId =>
  (DELIVERY_PACK_IDS as readonly string[]).includes(value)

// The last mode line in the text wins, so a follow-up in the same project
// recommends the step that was just finished.
export const completionIdFromText = (text: string | null | undefined): DeliveryPackId | null => {
  if (!text) return null
  let found: { index: number; id: DeliveryPackId } | null = null
  for (const match of text.matchAll(PACKAGE_MODE)) {
    const id = match[1]
    if (!id || !isDeliveryPackId(id)) continue
    const index = match.index ?? 0
    if (!found || index >= found.index) found = { index, id }
  }
  for (const match of text.matchAll(ANALYSIS_MODE)) {
    const index = match.index ?? 0
    if (!found || index >= found.index) found = { index, id: 'analysis' }
  }
  return found?.id ?? null
}

export const nextStepAfter = (
  id: DeliveryPackId,
  options?: { showUnreleasedPlaceholders?: boolean }
): NextStepRecommendation | null => {
  const show = options?.showUnreleasedPlaceholders ?? SHOW_UNRELEASED_PACK_PLACEHOLDERS
  if (id === 'consultation-pack' || id === 'statistician-export') {
    return { kind: 'available', id: 'analysis' }
  }
  if (id === 'analysis') return { kind: 'available', id: 'writing-pack' }
  if (!show) return null
  if (id === 'mentor-pack') return { kind: 'unreleased', id: 'ethics-application' }
  return { kind: 'unreleased', id: 'slides-poster' }
}

export type DeliveryMessage = {
  role: string
  status?: string
  content: string
}

// A delivery is one idle session that already has an agent reply, or one saved
// aggregate export. The first clarifying turn is the count doctors can copy;
// the same session is not counted again.
export const deliveredPackId = (input: {
  status: string
  contentLoaded?: false | boolean
  agentContext?: string | null
  messages: readonly DeliveryMessage[]
}): DeliveryPackId | null => {
  if (input.contentLoaded === false) return null
  if (input.status !== 'idle') return null
  const replied = input.messages.some(
    (message) =>
      message.role === 'agent' &&
      message.status !== 'streaming' &&
      message.content.trim().length > 0
  )
  if (!replied) return null
  const userTexts = input.messages.filter((message) => message.role === 'user')
  for (let index = userTexts.length - 1; index >= 0; index -= 1) {
    const id = completionIdFromText(userTexts[index]?.content)
    if (id) return id
  }
  return completionIdFromText(input.agentContext)
}
