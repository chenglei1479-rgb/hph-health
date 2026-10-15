import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import {
  consultationPackExportPrompt,
  DELIVERABLE_PACKAGE_IDS,
  HOME_DELIVERABLE_CARD_IDS,
  guardDeliverableOutboundText,
  isDeliverablePackage,
  mentorPackAgentInstruction,
  workflowRemindsEthicsApproval
} from './deliverable-packages'

it('keeps the three research deliverable packages', () => {
  expect(DELIVERABLE_PACKAGE_IDS).toEqual(['mentor-pack', 'consultation-pack', 'writing-pack'])
  expect(HOME_DELIVERABLE_CARD_IDS).toEqual([
    'writing-pack',
    'consultation-pack',
    'mentor-pack',
    'statistician-export'
  ])
  expect(isDeliverablePackage('mentor-pack')).toBe(true)
  expect(isDeliverablePackage('novelty')).toBe(false)
  expect(isDeliverablePackage('statistician-export')).toBe(false)
  expect(workflowRemindsEthicsApproval('writing-pack')).toBe(true)
  expect(workflowRemindsEthicsApproval('consultation-pack')).toBe(true)
  expect(workflowRemindsEthicsApproval('mentor-pack')).toBe(false)
  expect(mentorPackAgentInstruction((key) => key)).toContain('does not load patient data')
})

it('routes deliverable text through the PHI gate hook without sending it', () => {
  const source = readFileSync(new URL('./deliverable-packages.ts', import.meta.url), 'utf8')
  expect(source).toContain('TODO(phi-gate)')
  expect(source).toContain('releaseModelText')
  expect(source).toContain('src/main/phi/gate.ts')
  expect(source).not.toContain("from '../../../main/phi")
  expect(source).not.toContain('from "../../main/phi')
  const home = readFileSync(new URL('./HomePage.tsx', import.meta.url), 'utf8')
  expect(home).toContain('guardDeliverableOutboundText(')
  expect(guardDeliverableOutboundText('draft package', 'project-1')).toBe('draft package')
  const instruction = consultationPackExportPrompt((key) => key)
  expect(instruction).toContain('Do not export raw data')
  expect(instruction).toContain('no masking under 10')
  expect(instruction).not.toContain('include the chat history')
})
