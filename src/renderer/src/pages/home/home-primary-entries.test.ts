import { expect, it } from 'vitest'

import { HOME_PRIMARY_ENTRY_IDS, homePrimaryEntries } from './home-primary-entries'

it('keeps mentor prep, data analysis, and abstract writing in that order', () => {
  const entries = homePrimaryEntries((key) => key)
  expect(HOME_PRIMARY_ENTRY_IDS).toEqual(['mentor-prep', 'analyze-data', 'write-abstract'])
  expect(entries.map((entry) => entry.id)).toEqual([...HOME_PRIMARY_ENTRY_IDS])
  expect(entries.map((entry) => entry.workflow)).toEqual([
    'mentor-pack',
    'analysis',
    'writing-pack'
  ])
  expect(entries[0]?.hardRule).toContain('does not load patient data')
  expect(entries.map((entry) => entry.title)).not.toContain('Aggregate statistics export')
})
