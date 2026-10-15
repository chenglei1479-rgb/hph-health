import { readFileSync } from 'node:fs'

import { expect, it } from 'vitest'

import {
  SHOW_UNRELEASED_PACK_PLACEHOLDERS,
  WORKFLOW_MODE_ANALYSIS_LINE,
  completionIdFromText,
  deliveredPackId,
  nextStepAfter
} from './deliverable-next-step'

it('follows only packs that already exist, then a gated placeholder', () => {
  expect(SHOW_UNRELEASED_PACK_PLACEHOLDERS).toBe(true)
  expect(nextStepAfter('consultation-pack')).toEqual({ kind: 'available', id: 'analysis' })
  expect(nextStepAfter('statistician-export')).toEqual({ kind: 'available', id: 'analysis' })
  expect(nextStepAfter('analysis')).toEqual({ kind: 'available', id: 'writing-pack' })
  expect(nextStepAfter('mentor-pack')).toEqual({
    kind: 'unreleased',
    id: 'ethics-application'
  })
  expect(nextStepAfter('writing-pack')).toEqual({ kind: 'unreleased', id: 'slides-poster' })
  expect(nextStepAfter('mentor-pack', { showUnreleasedPlaceholders: false })).toBeNull()
  expect(nextStepAfter('writing-pack', { showUnreleasedPlaceholders: false })).toBeNull()
  expect(nextStepAfter('consultation-pack', { showUnreleasedPlaceholders: false })).toEqual({
    kind: 'available',
    id: 'analysis'
  })
})

it('reads the latest package or analysis mode line', () => {
  expect(completionIdFromText('Package mode: consultation-pack')).toBe('consultation-pack')
  expect(
    completionIdFromText(`Package mode: consultation-pack\n${WORKFLOW_MODE_ANALYSIS_LINE}`)
  ).toBe('analysis')
  expect(completionIdFromText('Package mode: mentor-pack')).toBe('mentor-pack')
  expect(completionIdFromText('no mode')).toBeNull()
})

it('counts a pack only after an idle agent reply', () => {
  const messages = [
    { role: 'user', content: 'Package mode: writing-pack' },
    { role: 'agent', status: 'complete', content: 'Draft ready for review.' }
  ]
  expect(
    deliveredPackId({ status: 'running', messages, agentContext: 'Package mode: mentor-pack' })
  ).toBeNull()
  expect(deliveredPackId({ status: 'idle', messages, contentLoaded: false })).toBeNull()
  expect(deliveredPackId({ status: 'idle', messages })).toBe('writing-pack')
  expect(
    deliveredPackId({
      status: 'idle',
      messages: [{ role: 'user', content: 'hello' }],
      agentContext: 'Package mode: mentor-pack'
    })
  ).toBeNull()
})

it('keeps the chain module free of a date or a time promise', () => {
  const source = readFileSync(new URL('./deliverable-next-step.ts', import.meta.url), 'utf8')
  expect(source).not.toMatch(/まもなく|soon|shortly|bientôt|bald|pronto|скоро/)
  expect(source).not.toMatch(/\d{4}-\d{2}-\d{2}/)
})
