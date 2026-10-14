import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import {
  DELIVERABLE_PACKAGE_IDS,
  guardDeliverableOutboundText,
  isDeliverablePackage
} from './deliverable-packages'

it('keeps the three research deliverable packages', () => {
  expect(DELIVERABLE_PACKAGE_IDS).toEqual(['mentor-pack', 'consultation-pack', 'writing-pack'])
  expect(isDeliverablePackage('mentor-pack')).toBe(true)
  expect(isDeliverablePackage('novelty')).toBe(false)
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
})
