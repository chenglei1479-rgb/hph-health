import { readFileSync } from 'node:fs'

import { expect, it } from 'vitest'

import { cornerFloatingEntriesVisible } from './corner-floating-entries'

it('hides the corner floating entries on home and keeps them on other views', () => {
  expect(cornerFloatingEntriesVisible('home')).toBe(false)
  expect(cornerFloatingEntriesVisible('workspace')).toBe(true)
  expect(cornerFloatingEntriesVisible('library')).toBe(true)
  const host = readFileSync('src/renderer/src/ApplicationPresentationHost.tsx', 'utf8')
  expect(host).toContain('cornerFloatingEntriesVisible(events.navigation.view)')
})
